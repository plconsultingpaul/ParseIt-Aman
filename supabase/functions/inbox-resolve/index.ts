import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const { inboxItemId, action, editedData, resolutionNotes, userId, changeLog } = await req.json();

    if (!inboxItemId || !action) {
      return new Response(
        JSON.stringify({ error: "inboxItemId and action are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action !== 'accept' && action !== 'reject') {
      return new Response(
        JSON.stringify({ error: "action must be 'accept' or 'reject'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch the inbox item
    const itemResp = await fetch(
      `${supabaseUrl}/rest/v1/inbox_items?id=eq.${inboxItemId}&select=*`,
      {
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
          'apikey': supabaseServiceKey
        }
      }
    );

    if (!itemResp.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch inbox item" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const items = await itemResp.json();
    if (!items || items.length === 0) {
      return new Response(
        JSON.stringify({ error: "Inbox item not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const inboxItem = items[0];

    if (inboxItem.status !== 'pending' && inboxItem.status !== 'failed') {
      return new Response(
        JSON.stringify({ error: `Inbox item already resolved (status: ${inboxItem.status})` }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resolvedAt = new Date().toISOString();
    const contextData = inboxItem.context_data || {};

    // Find the target node wired to a specific output connector on the inbox node
    const findNextNodeId = async (handle: string): Promise<string | null> => {
      const edgesResp = await fetch(
        `${supabaseUrl}/rest/v1/workflow_v2_edges?workflow_id=eq.${inboxItem.workflow_id}&source_node_id=eq.${inboxItem.inbox_node_id}&select=*`,
        {
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
            'apikey': supabaseServiceKey
          }
        }
      );
      if (!edgesResp.ok) return null;
      const edges = await edgesResp.json();
      const match = edges.find((e: any) => (e.source_handle || 'default') === handle);
      return match ? match.target_node_id : null;
    };

    // Resume the paused workflow at the given node and return the processor outcome
    const resumeWorkflow = async (nextNodeId: string): Promise<{ ok: boolean; result: any }> => {
      let processingMode = 'json';
      if (inboxItem.workflow_execution_log_id) {
        const logResp = await fetch(
          `${supabaseUrl}/rest/v1/workflow_v2_execution_logs?id=eq.${inboxItem.workflow_execution_log_id}&select=processing_mode`,
          {
            headers: {
              'Authorization': `Bearer ${supabaseServiceKey}`,
              'Content-Type': 'application/json',
              'apikey': supabaseServiceKey
            }
          }
        );
        if (logResp.ok) {
          const logs = await logResp.json();
          if (logs[0]?.processing_mode) {
            processingMode = logs[0].processing_mode;
          }
        }
      }

      const processorSlug = processingMode === 'transform'
        ? 'transform-workflow-processor-v2'
        : 'json-workflow-processor-v2';

      const resumePayload = {
        workflowId: inboxItem.workflow_id,
        extractionTypeId: inboxItem.extraction_type_id,
        resumeFromNodeId: nextNodeId,
        resumeContextData: contextData,
        editedData: editedData || inboxItem.extracted_data,
        extractionLogId: inboxItem.extraction_log_id,
        executionLogId: inboxItem.workflow_execution_log_id,
        triggerSource: inboxItem.trigger_source,
        userId: userId || null
      };

      const processorResp = await fetch(
        `${supabaseUrl}/functions/v1/${processorSlug}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(resumePayload)
        }
      );

      return { ok: processorResp.ok, result: await processorResp.json() };
    };

    if (action === 'reject') {
      // Store resolution details up front
      await fetch(`${supabaseUrl}/rest/v1/inbox_items?id=eq.${inboxItemId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
          'apikey': supabaseServiceKey
        },
        body: JSON.stringify({
          edited_data: editedData || null,
          resolution_notes: resolutionNotes || null,
          updated_at: resolvedAt
        })
      });

      const rejectNodeId = await findNextNodeId('reject');

      if (!rejectNodeId) {
        // No Reject path wired — terminate the workflow as rejected
        await fetch(`${supabaseUrl}/rest/v1/inbox_items?id=eq.${inboxItemId}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
            'apikey': supabaseServiceKey
          },
          body: JSON.stringify({
            status: 'rejected',
            resolved_by: userId || null,
            resolved_at: resolvedAt,
            resolution_notes: resolutionNotes || null,
            updated_at: resolvedAt
          })
        });

        if (inboxItem.workflow_execution_log_id) {
          await fetch(`${supabaseUrl}/rest/v1/workflow_v2_execution_logs?id=eq.${inboxItem.workflow_execution_log_id}`, {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${supabaseServiceKey}`,
              'Content-Type': 'application/json',
              'apikey': supabaseServiceKey
            },
            body: JSON.stringify({
              status: 'rejected',
              completed_at: resolvedAt,
              updated_at: resolvedAt
            })
          });
        }

        return new Response(
          JSON.stringify({ success: true, action: 'reject', inboxItemId }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Resume the workflow down the Reject path
      const { ok, result } = await resumeWorkflow(rejectNodeId);

      if (!ok) {
        const failureReason = result?.error || 'Workflow processor returned an error';
        await fetch(`${supabaseUrl}/rest/v1/inbox_items?id=eq.${inboxItemId}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
            'apikey': supabaseServiceKey
          },
          body: JSON.stringify({
            status: 'failed',
            failure_reason: failureReason,
            updated_at: new Date().toISOString()
          })
        });

        return new Response(
          JSON.stringify({ success: false, action: 'reject', inboxItemId, error: failureReason, details: result }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await fetch(`${supabaseUrl}/rest/v1/inbox_items?id=eq.${inboxItemId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
          'apikey': supabaseServiceKey
        },
        body: JSON.stringify({
          status: 'rejected',
          resolved_by: userId || null,
          resolved_at: resolvedAt,
          resolution_notes: resolutionNotes || null,
          failure_reason: null,
          updated_at: resolvedAt
        })
      });

      return new Response(
        JSON.stringify({ success: true, action: 'reject', inboxItemId, workflowResult: result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // action === 'accept'
    // Store edited data immediately but do NOT change status yet
    await fetch(`${supabaseUrl}/rest/v1/inbox_items?id=eq.${inboxItemId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey
      },
      body: JSON.stringify({
        edited_data: editedData || null,
        resolution_notes: resolutionNotes || null,
        has_edits: Array.isArray(changeLog) && changeLog.length > 0,
        change_log: Array.isArray(changeLog) && changeLog.length > 0 ? changeLog : null,
        updated_at: resolvedAt
      })
    });

    // Find the next node wired to the Accept connector on the inbox node
    const nextNodeId = await findNextNodeId('accept');

    if (!nextNodeId) {
      // No more steps after inbox — mark workflow complete and accepted
      await fetch(`${supabaseUrl}/rest/v1/inbox_items?id=eq.${inboxItemId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
          'apikey': supabaseServiceKey
        },
        body: JSON.stringify({
          status: 'accepted',
          resolved_by: userId || null,
          resolved_at: resolvedAt,
          updated_at: resolvedAt
        })
      });

      if (inboxItem.workflow_execution_log_id) {
        await fetch(`${supabaseUrl}/rest/v1/workflow_v2_execution_logs?id=eq.${inboxItem.workflow_execution_log_id}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
            'apikey': supabaseServiceKey
          },
          body: JSON.stringify({
            status: 'completed',
            completed_at: resolvedAt,
            updated_at: resolvedAt
          })
        });
      }

      return new Response(
        JSON.stringify({ success: true, action: 'accept', inboxItemId, message: 'No remaining steps — workflow completed.' }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { ok: acceptOk, result: processorResult } = await resumeWorkflow(nextNodeId);

    // If the processor call itself failed, mark as failed
    if (!acceptOk) {
      const failureReason = processorResult?.error || 'Workflow processor returned an error';
      await fetch(`${supabaseUrl}/rest/v1/inbox_items?id=eq.${inboxItemId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
          'apikey': supabaseServiceKey
        },
        body: JSON.stringify({
          status: 'failed',
          failure_reason: failureReason,
          updated_at: new Date().toISOString()
        })
      });

      return new Response(
        JSON.stringify({
          success: false,
          action: 'accept',
          inboxItemId,
          error: failureReason,
          details: processorResult
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract bill_number from the workflow result.
    // Prefer the workflow's accumulated final data, since the bill number may be
    // produced by an intermediate step rather than the last API step. Fall back
    // to the last API response for backward compatibility.
    let billNumber: string | null = null;
    try {
      const finalData = processorResult?.finalData;
      if (finalData && typeof finalData === 'object') {
        if (finalData.billNumber) {
          billNumber = finalData.billNumber;
        } else if (finalData.orders && Array.isArray(finalData.orders) && finalData.orders.length > 0 && finalData.orders[0].billNumber) {
          billNumber = finalData.orders[0].billNumber;
        } else if (finalData.data && finalData.data.billNumber) {
          billNumber = finalData.data.billNumber;
        } else if (finalData.response && finalData.response.billNumber) {
          billNumber = finalData.response.billNumber;
        }
      }

      if (!billNumber) {
        const apiResp = processorResult?.lastApiResponse;
        if (apiResp && typeof apiResp === 'object') {
          if (apiResp.billNumber) {
            billNumber = apiResp.billNumber;
          } else if (apiResp.orders && Array.isArray(apiResp.orders) && apiResp.orders.length > 0 && apiResp.orders[0].billNumber) {
            billNumber = apiResp.orders[0].billNumber;
          } else if (apiResp.data && apiResp.data.billNumber) {
            billNumber = apiResp.data.billNumber;
          }
        }
      }
    } catch (_) {
      // Non-critical — bill number extraction is best-effort
    }

    // If no bill number returned, mark as failed
    if (!billNumber) {
      const failureReason = 'No bill number returned from the workflow';
      await fetch(`${supabaseUrl}/rest/v1/inbox_items?id=eq.${inboxItemId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
          'apikey': supabaseServiceKey
        },
        body: JSON.stringify({
          status: 'failed',
          failure_reason: failureReason,
          updated_at: new Date().toISOString()
        })
      });

      return new Response(
        JSON.stringify({
          success: false,
          action: 'accept',
          inboxItemId,
          error: failureReason,
          workflowResult: processorResult
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Success — mark as accepted with bill number
    await fetch(`${supabaseUrl}/rest/v1/inbox_items?id=eq.${inboxItemId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey
      },
      body: JSON.stringify({
        status: 'accepted',
        resolved_by: userId || null,
        resolved_at: resolvedAt,
        bill_number: billNumber,
        failure_reason: null,
        updated_at: resolvedAt
      })
    });

    return new Response(
      JSON.stringify({
        success: true,
        action: 'accept',
        inboxItemId,
        workflowResult: processorResult,
        billNumber
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    console.error('inbox-resolve error:', err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
