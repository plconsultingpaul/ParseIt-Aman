import { EmailProvider } from './email-base.ts';
import { EmailMessage, PdfAttachment, EmailMonitoringConfig } from '../../types.ts';
import { getPdfPageCount } from '../pdf.ts';

export class GmailProvider implements EmailProvider {
  readonly providerName = 'gmail';
  private config: EmailMonitoringConfig;
  private accessToken: string = '';

  constructor(config: EmailMonitoringConfig) {
    this.config = config;
  }

  async authenticate(): Promise<string> {
    const clientId = this.config.gmail_monitoring_client_id || this.config.gmail_client_id;
    const clientSecret = this.config.gmail_monitoring_client_secret || this.config.gmail_client_secret;
    const refreshToken = this.config.gmail_monitoring_refresh_token || this.config.gmail_refresh_token;

    console.log('Using Gmail monitoring credentials:', {
      usingDedicatedCredentials: !!(this.config.gmail_monitoring_client_id && this.config.gmail_monitoring_client_secret && this.config.gmail_monitoring_refresh_token),
      clientIdSource: this.config.gmail_monitoring_client_id ? 'monitoring' : 'send'
    });

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_id: clientId || '',
        client_secret: clientSecret || '',
        refresh_token: refreshToken || '',
        grant_type: 'refresh_token'
      })
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Failed to refresh Gmail token:', errorText);
      throw new Error(`Failed to refresh Gmail access token: ${errorText}`);
    }

    const tokenData = await tokenResponse.json();
    this.accessToken = tokenData.access_token;
    console.log('Gmail access token refreshed successfully');
    return this.accessToken;
  }

  async fetchUnreadEmails(): Promise<EmailMessage[]> {
    let query = `is:unread`;

    if (this.config.gmail_monitored_label && this.config.gmail_monitored_label !== 'INBOX') {
      query += ` label:${this.config.gmail_monitored_label}`;
    } else {
      query += ` in:inbox`;
    }

    if (!this.config.check_all_messages && this.config.last_check) {
      const lastCheckDate = new Date(this.config.last_check);
      const timestamp = Math.floor(lastCheckDate.getTime() / 1000);
      query += ` after:${timestamp}`;
    }

    console.log('Gmail search query:', query);

    const searchResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}`, {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`
      }
    });

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      console.error('Gmail search failed:', errorText);
      throw new Error(`Failed to search Gmail messages: ${errorText}`);
    }

    const searchData = await searchResponse.json();
    const messages = searchData.messages || [];
    console.log('Found', messages.length, 'Gmail messages');

    return messages.map((m: any) => ({
      id: m.id,
      subject: '',
      from: '',
      receivedDate: ''
    }));
  }

  async getEmailDetails(emailId: string): Promise<{
    subject: string;
    from: string;
    receivedDate: string;
  }> {
    const messageResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${emailId}`, {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`
      }
    });

    if (!messageResponse.ok) {
      const errorText = await messageResponse.text();
      console.error('Failed to fetch message details:', errorText);
      throw new Error(`Failed to fetch message details: ${errorText}`);
    }

    const messageData = await messageResponse.json();
    const headers = messageData.payload.headers;
    const subject = headers.find((h: any) => h.name === 'Subject')?.value || '';
    const fromHeader = headers.find((h: any) => h.name === 'From')?.value || '';
    const receivedDate = headers.find((h: any) => h.name === 'Date')?.value || '';

    const fromMatch = fromHeader.match(/<([^>]+)>/);
    const from = fromMatch ? fromMatch[1] : fromHeader;

    return { subject, from, receivedDate };
  }

  async getEmailBody(emailId: string): Promise<string> {
    const resp = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${emailId}?format=full`,
      { headers: { 'Authorization': `Bearer ${this.accessToken}` } }
    );

    if (!resp.ok) {
      const errorText = await resp.text();
      throw new Error(`Failed to fetch email body: ${errorText}`);
    }

    const data = await resp.json();

    const extractBody = (part: any): string => {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
      }
      if (part.parts) {
        for (const sub of part.parts) {
          const result = extractBody(sub);
          if (result) return result;
        }
      }
      return '';
    };

    let body = extractBody(data.payload);

    if (!body) {
      const extractHtml = (part: any): string => {
        if (part.mimeType === 'text/html' && part.body?.data) {
          const html = atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
          return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
        }
        if (part.parts) {
          for (const sub of part.parts) {
            const result = extractHtml(sub);
            if (result) return result;
          }
        }
        return '';
      };
      body = extractHtml(data.payload);
    }

    return body;
  }

  async findPdfAttachments(emailId: string): Promise<PdfAttachment[]> {
    const messageResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${emailId}`, {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`
      }
    });

    if (!messageResponse.ok) {
      return [];
    }

    const messageData = await messageResponse.json();
    const attachments: { filename: string; attachmentId: string }[] = [];

    const findAttachments = (part: any) => {
      if (part.parts) {
        part.parts.forEach(findAttachments);
      } else if (part.filename && part.filename.toLowerCase().endsWith('.pdf') && part.body?.attachmentId) {
        attachments.push({
          filename: part.filename,
          attachmentId: part.body.attachmentId
        });
      }
    };

    findAttachments(messageData.payload);

    const downloadedAttachments: PdfAttachment[] = [];
    for (const attachment of attachments) {
      try {
        const attachmentResponse = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${emailId}/attachments/${attachment.attachmentId}`,
          {
            headers: {
              'Authorization': `Bearer ${this.accessToken}`
            }
          }
        );

        if (attachmentResponse.ok) {
          const attachmentData = await attachmentResponse.json();
          const base64Data = attachmentData.data.replace(/-/g, '+').replace(/_/g, '/');
          const pageCount = await getPdfPageCount(base64Data);

          downloadedAttachments.push({
            filename: attachment.filename,
            base64: base64Data,
            pageCount
          });
        }
      } catch (error) {
        console.error('Error downloading Gmail attachment:', error);
      }
    }

    return downloadedAttachments;
  }

  async applyPostProcessAction(emailId: string, action: string, folderPath: string): Promise<void> {
    console.log(`Applying Gmail post-process action: ${action}`);

    if (action === 'none') {
      console.log('Post-process action is "none", skipping');
      return;
    }

    try {
      switch (action) {
        case 'mark_read':
          await this.markAsRead(emailId);
          break;

        case 'move':
          await this.moveToLabel(emailId, folderPath);
          await this.markAsRead(emailId);
          break;

        case 'archive':
          await this.archive(emailId);
          break;

        case 'delete':
          await this.moveToTrash(emailId);
          break;
      }
      console.log(`Post-process action "${action}" completed successfully`);
    } catch (error) {
      console.warn(`Post-process action "${action}" failed:`, (error as Error).message);
    }
  }

  private async markAsRead(emailId: string): Promise<void> {
    await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${emailId}/modify`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        removeLabelIds: ['UNREAD']
      })
    });
  }

  private async moveToLabel(emailId: string, labelName: string): Promise<void> {
    const labelsResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`
      }
    });

    if (!labelsResponse.ok) {
      console.warn('Could not fetch Gmail labels');
      return;
    }

    const labelsData = await labelsResponse.json();
    let targetLabel = labelsData.labels.find((label: any) => label.name === labelName);

    if (!targetLabel) {
      const createLabelResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: labelName,
          labelListVisibility: 'labelShow',
          messageListVisibility: 'show'
        })
      });

      if (createLabelResponse.ok) {
        targetLabel = await createLabelResponse.json();
      } else {
        console.warn('Could not create Gmail label:', labelName);
        return;
      }
    }

    await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${emailId}/modify`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        addLabelIds: [targetLabel.id],
        removeLabelIds: ['INBOX']
      })
    });

    console.log(`Moved Gmail message to ${labelName}`);
  }

  private async archive(emailId: string): Promise<void> {
    await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${emailId}/modify`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        removeLabelIds: ['INBOX', 'UNREAD']
      })
    });
  }

  private async moveToTrash(emailId: string): Promise<void> {
    await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${emailId}/trash`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`
      }
    });
  }
}
