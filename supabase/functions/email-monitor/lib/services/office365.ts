import { EmailProvider } from './email-base.ts';
import { EmailMessage, PdfAttachment, EmailMonitoringConfig } from '../../types.ts';
import { getPdfPageCount } from '../pdf.ts';

export class Office365Provider implements EmailProvider {
  readonly providerName = 'office365';
  private config: EmailMonitoringConfig;
  private accessToken: string = '';

  constructor(config: EmailMonitoringConfig) {
    this.config = config;
  }

  async authenticate(): Promise<string> {
    const tenantId = this.config.monitoring_tenant_id || this.config.tenant_id;
    const clientId = this.config.monitoring_client_id || this.config.client_id;
    const clientSecret = this.config.monitoring_client_secret || this.config.client_secret;

    console.log('Using Office365 monitoring credentials:', {
      usingDedicatedCredentials: !!(this.config.monitoring_tenant_id && this.config.monitoring_client_id && this.config.monitoring_client_secret),
      tenantIdSource: this.config.monitoring_tenant_id ? 'monitoring' : 'send',
      clientIdSource: this.config.monitoring_client_id ? 'monitoring' : 'send'
    });

    const tokenResponse = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_id: clientId || '',
        client_secret: clientSecret || '',
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials'
      })
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Failed to get Office365 token:', errorText);
      throw new Error(`Failed to get Office365 access token: ${errorText}`);
    }

    const tokenData = await tokenResponse.json();
    this.accessToken = tokenData.access_token;
    console.log('Office365 access token obtained successfully');
    return this.accessToken;
  }

  async fetchUnreadEmails(): Promise<EmailMessage[]> {
    let filter = 'isRead eq false';
    if (!this.config.check_all_messages && this.config.last_check) {
      const lastCheckDate = new Date(this.config.last_check).toISOString();
      filter += ` and receivedDateTime gt ${lastCheckDate}`;
    }

    console.log('Office365 filter:', filter);

    const emailsResponse = await fetch(
      `https://graph.microsoft.com/v1.0/users/${this.config.monitored_email}/mailFolders/Inbox/messages?$filter=${encodeURIComponent(filter)}&$select=id,subject,from,receivedDateTime,hasAttachments&$top=50&$orderby=receivedDateTime asc`,
      {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      }
    );

    if (!emailsResponse.ok) {
      const errorText = await emailsResponse.text();
      console.error('Office365 emails fetch failed:', errorText);
      throw new Error(`Failed to fetch Office365 emails: ${errorText}`);
    }

    const emailsData = await emailsResponse.json();
    const emails = emailsData.value || [];
    console.log('Found', emails.length, 'Office365 emails');

    return emails.map((email: any) => ({
      id: email.id,
      subject: email.subject || '',
      from: email.from?.emailAddress?.address || '',
      receivedDate: email.receivedDateTime || ''
    }));
  }

  async getEmailDetails(emailId: string): Promise<{
    subject: string;
    from: string;
    receivedDate: string;
  }> {
    const messageResponse = await fetch(
      `https://graph.microsoft.com/v1.0/users/${this.config.monitored_email}/messages/${emailId}?$select=subject,from,receivedDateTime`,
      {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      }
    );

    if (!messageResponse.ok) {
      const errorText = await messageResponse.text();
      throw new Error(`Failed to fetch message details: ${errorText}`);
    }

    const email = await messageResponse.json();
    return {
      subject: email.subject || '',
      from: email.from?.emailAddress?.address || '',
      receivedDate: email.receivedDateTime || ''
    };
  }

  async getEmailBody(emailId: string): Promise<string> {
    const resp = await fetch(
      `https://graph.microsoft.com/v1.0/users/${this.config.monitored_email}/messages/${emailId}?$select=body`,
      { headers: { 'Authorization': `Bearer ${this.accessToken}` } }
    );

    if (!resp.ok) {
      const errorText = await resp.text();
      throw new Error(`Failed to fetch email body: ${errorText}`);
    }

    const data = await resp.json();
    const bodyContent = data.body?.content || '';
    return bodyContent.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  }

  async findPdfAttachments(emailId: string): Promise<PdfAttachment[]> {
    const attachments: PdfAttachment[] = [];

    try {
      const attachmentsResponse = await fetch(
        `https://graph.microsoft.com/v1.0/users/${this.config.monitored_email}/messages/${emailId}/attachments`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`
          }
        }
      );

      if (attachmentsResponse.ok) {
        const attachmentsData = await attachmentsResponse.json();

        for (const attachment of attachmentsData.value) {
          if (attachment.name && attachment.name.toLowerCase().endsWith('.pdf')) {
            const pageCount = await getPdfPageCount(attachment.contentBytes);

            attachments.push({
              filename: attachment.name,
              base64: attachment.contentBytes,
              pageCount
            });
          }
        }
      }
    } catch (error) {
      console.error('Error fetching Office365 attachments:', error);
    }

    return attachments;
  }

  async applyPostProcessAction(emailId: string, action: string, folderPath: string): Promise<void> {
    const ppEnterAt = Date.now();
    console.log(`[POST_PROCESS][O365] ENTERED action="${action}" folder="${folderPath}" emailId=${emailId}`);

    if (action === 'none') {
      console.log(`[POST_PROCESS][O365] RETURNING (action=none) elapsedMs=${Date.now() - ppEnterAt}`);
      return;
    }

    try {
      switch (action) {
        case 'mark_read':
          await this.markAsRead(emailId);
          break;

        case 'move':
          await this.moveToFolder(emailId, folderPath);
          await this.markAsRead(emailId);
          break;

        case 'archive':
          await this.archive(emailId);
          break;

        case 'delete':
          await this.moveToDeletedItems(emailId);
          break;
      }
      console.log(`[POST_PROCESS][O365] Action "${action}" SUCCESS elapsedMs=${Date.now() - ppEnterAt}`);
    } catch (error) {
      console.error(`[POST_PROCESS][O365] Action "${action}" FAILED elapsedMs=${Date.now() - ppEnterAt} emailId=${emailId}:`, (error as Error).message, error);
    }
    console.log(`[POST_PROCESS][O365] RETURNING (end of fn) elapsedMs=${Date.now() - ppEnterAt}`);
  }

  private async markAsRead(emailId: string): Promise<void> {
    const resp = await fetch(`https://graph.microsoft.com/v1.0/users/${this.config.monitored_email}/messages/${emailId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        isRead: true
      })
    });
    if (!resp.ok) {
      const errorText = await resp.text();
      console.error(`[POST_PROCESS] markAsRead failed (${resp.status}):`, errorText);
      throw new Error(`markAsRead failed (${resp.status}): ${errorText}`);
    }
    console.log('[POST_PROCESS] markAsRead succeeded');
  }

  private async moveToFolder(emailId: string, folderName: string): Promise<void> {
    console.log(`[POST_PROCESS] moveToFolder: looking up folder "${folderName}"`);
    const filterUrl = `https://graph.microsoft.com/v1.0/users/${this.config.monitored_email}/mailFolders?$filter=displayName eq '${folderName}'&$top=1`;
    const foldersResponse = await fetch(filterUrl, {
      headers: { 'Authorization': `Bearer ${this.accessToken}` }
    });
    if (!foldersResponse.ok) {
      const errorText = await foldersResponse.text();
      console.error(`[POST_PROCESS] Failed to query mail folders (${foldersResponse.status}):`, errorText);
      throw new Error(`Failed to query mail folders (${foldersResponse.status}): ${errorText}`);
    }
    const foldersData = await foldersResponse.json();
    let targetFolder = foldersData.value?.[0] || null;
    console.log(`[POST_PROCESS] Folder lookup result: ${targetFolder ? `found id=${targetFolder.id}` : 'NOT FOUND, will create'}`);

    if (!targetFolder) {
      const createFolderResponse = await fetch(`https://graph.microsoft.com/v1.0/users/${this.config.monitored_email}/mailFolders`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ displayName: folderName })
      });
      if (createFolderResponse.ok) {
        targetFolder = await createFolderResponse.json();
        console.log(`[POST_PROCESS] Created folder "${folderName}" with id=${targetFolder.id}`);
      } else if (createFolderResponse.status === 409) {
        console.log(`[POST_PROCESS] Folder "${folderName}" already exists (409), retrying lookup`);
        const retryResp = await fetch(filterUrl, {
          headers: { 'Authorization': `Bearer ${this.accessToken}` }
        });
        if (retryResp.ok) {
          const retryData = await retryResp.json();
          targetFolder = retryData.value?.[0] || null;
        }
        if (!targetFolder) {
          throw new Error(`Folder "${folderName}" exists but could not be found by filter`);
        }
        console.log(`[POST_PROCESS] Found folder "${folderName}" on retry, id=${targetFolder.id}`);
      } else {
        const errorText = await createFolderResponse.text();
        console.error(`[POST_PROCESS] Failed to create folder "${folderName}" (${createFolderResponse.status}):`, errorText);
        throw new Error(`Failed to create folder "${folderName}" (${createFolderResponse.status}): ${errorText}`);
      }
    }

    const moveResp = await fetch(`https://graph.microsoft.com/v1.0/users/${this.config.monitored_email}/messages/${emailId}/move`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ destinationId: targetFolder.id })
    });
    if (!moveResp.ok) {
      const errorText = await moveResp.text();
      console.error(`[POST_PROCESS] Move to folder "${folderName}" failed (${moveResp.status}):`, errorText);
      throw new Error(`Move to folder failed (${moveResp.status}): ${errorText}`);
    }
    console.log(`[POST_PROCESS] Successfully moved email to folder "${folderName}"`);
  }

  private async archive(emailId: string): Promise<void> {
    const foldersResponse = await fetch(`https://graph.microsoft.com/v1.0/users/${this.config.monitored_email}/mailFolders?$filter=displayName eq 'Archive'&$top=1`, {
      headers: { 'Authorization': `Bearer ${this.accessToken}` }
    });
    if (!foldersResponse.ok) {
      const errorText = await foldersResponse.text();
      console.error(`[POST_PROCESS] Failed to query folders for archive (${foldersResponse.status}):`, errorText);
      throw new Error(`Failed to query folders for archive (${foldersResponse.status}): ${errorText}`);
    }
    const foldersData = await foldersResponse.json();
    const archiveFolder = foldersData.value?.[0] || null;

    if (!archiveFolder) {
      console.error('[POST_PROCESS] Archive folder not found');
      throw new Error('Archive folder not found');
    }

    const moveResp = await fetch(`https://graph.microsoft.com/v1.0/users/${this.config.monitored_email}/messages/${emailId}/move`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ destinationId: archiveFolder.id })
    });
    if (!moveResp.ok) {
      const errorText = await moveResp.text();
      console.error(`[POST_PROCESS] Archive move failed (${moveResp.status}):`, errorText);
      throw new Error(`Archive move failed (${moveResp.status}): ${errorText}`);
    }
    console.log('[POST_PROCESS] Successfully archived email');

    await this.markAsRead(emailId);
  }

  private async moveToDeletedItems(emailId: string): Promise<void> {
    const foldersResponse = await fetch(`https://graph.microsoft.com/v1.0/users/${this.config.monitored_email}/mailFolders?$filter=displayName eq 'Deleted Items'&$top=1`, {
      headers: { 'Authorization': `Bearer ${this.accessToken}` }
    });
    if (!foldersResponse.ok) {
      const errorText = await foldersResponse.text();
      console.error(`[POST_PROCESS] Failed to query folders for delete (${foldersResponse.status}):`, errorText);
      throw new Error(`Failed to query folders for delete (${foldersResponse.status}): ${errorText}`);
    }
    const foldersData = await foldersResponse.json();
    const deletedFolder = foldersData.value?.[0] || null;

    if (!deletedFolder) {
      console.error('[POST_PROCESS] Deleted Items folder not found');
      throw new Error('Deleted Items folder not found');
    }

    const moveResp = await fetch(`https://graph.microsoft.com/v1.0/users/${this.config.monitored_email}/messages/${emailId}/move`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ destinationId: deletedFolder.id })
    });
    if (!moveResp.ok) {
      const errorText = await moveResp.text();
      console.error(`[POST_PROCESS] Delete move failed (${moveResp.status}):`, errorText);
      throw new Error(`Delete move failed (${moveResp.status}): ${errorText}`);
    }
    console.log('[POST_PROCESS] Successfully moved email to Deleted Items');
  }
}
