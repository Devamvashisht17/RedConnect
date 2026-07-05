(() => {
  const feed = document.getElementById('donor-requests-feed');
  if (!feed) return;

  const statusEl = document.getElementById('donor-feed-status');
  const compatibleOnlyFilter = document.getElementById('compatibleOnlyFilter');
  const urgencyFilter = document.getElementById('urgencyFilter');
  const summaryTotal = document.getElementById('feedSummaryTotal');
  const summaryCompatible = document.getElementById('feedSummaryCompatible');
  const summaryCritical = document.getElementById('feedSummaryCritical');

  const endpoint = feed.dataset.feedEndpoint;
  const respondEndpointTemplate = feed.dataset.respondEndpointTemplate || '';
  const viewEndpointTemplate = feed.dataset.viewEndpointTemplate || '';
  const emptyMessage = feed.dataset.emptyMessage || 'No matching requests available right now.';

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function setStatus(message, isError = false) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.style.color = isError ? '#b91c1c' : '#6b7280';
  }

  function formatDate(value) {
    if (!value) return 'Just now';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Just now';
    return date.toLocaleString();
  }

  function updateSummary(summary) {
    if (!summary) return;
    if (summaryTotal) summaryTotal.textContent = String(summary.total ?? 0);
    if (summaryCompatible) summaryCompatible.textContent = String(summary.compatible ?? 0);
    if (summaryCritical) summaryCritical.textContent = String(summary.critical ?? 0);
  }

  function buildQuery() {
    const params = new URLSearchParams();
    if (compatibleOnlyFilter?.checked) params.set('compatibleOnly', 'true');
    const urgency = urgencyFilter?.value || 'all';
    if (urgency !== 'all') params.set('urgency', urgency);
    return params;
  }

  function endpointFor(template, id) {
    return template.replace('__ID__', encodeURIComponent(id));
  }

  function renderRequestCard(request) {
    const urgencyClass = (request.emergencyLevel || 'Normal').toLowerCase();
    const compatibilityTone = request.compatibilityTone || 'neutral';
    const compatibleClass = request.isCompatible ? 'compatible' : 'incompatible';
    const compatibilityLabel = request.compatibilityLabel || (request.isCompatible ? 'Compatible with your blood type' : 'Not compatible with your blood type');
    const priorityLabel = request.priorityLabel || (request.emergencyLevel === 'Critical' ? 'Top priority' : request.emergencyLevel === 'Urgent' ? 'High priority' : 'Standard priority');
    const locationParts = [request.city, request.area].filter(Boolean).join(' · ');
    const detailsUrl = endpointFor(viewEndpointTemplate, request.requestId);
    const respondUrl = endpointFor(respondEndpointTemplate, request.requestId);

    return `
      <article class="request-card donor-feed-request ${compatibleClass} ${urgencyClass}">
        <div class="request-card-header">
          <div>
            <h3>${escapeHtml(request.patientName || 'Patient request')}</h3>
            <div class="request-meta">
              <span class="blood-pill">${escapeHtml(request.bloodGroupRequired || 'Unknown')}</span>
              <span class="urgency-pill ${urgencyClass}">${escapeHtml(request.emergencyLevel || 'Normal')}</span>
              <span class="compat-badge ${compatibilityTone}">${escapeHtml(compatibilityLabel)}</span>
            </div>
          </div>
          <span class="priority-tag ${urgencyClass}">${escapeHtml(priorityLabel)}</span>
        </div>
        <div class="request-card-body">
          <div class="request-detail-grid">
            <div>
              <span class="detail-label">Location</span>
              <strong>${escapeHtml(locationParts || 'Unknown location')}</strong>
            </div>
            <div>
              <span class="detail-label">Requested</span>
              <strong>${escapeHtml(formatDate(request.createdAt))}</strong>
            </div>
          </div>
          ${request.additionalMessage ? `<p class="subtle-note">${escapeHtml(request.additionalMessage)}</p>` : ''}
          <div class="request-actions donor-feed-actions">
            <a href="${detailsUrl}" class="btn-secondary">View Details</a>
            ${request.isCompatible && !request.hasResponded
              ? `<button type="button" class="btn-primary request-respond-btn" data-request-id="${escapeHtml(request.requestId)}" data-respond-url="${respondUrl}">Respond</button>`
              : request.hasResponded
                ? `<span class="response-pill accepted">Response sent</span>`
                : `<span class="response-pill pending">Not compatible</span>`}
          </div>
        </div>
      </article>
    `;
  }

  function renderRequests(requests) {
    if (!Array.isArray(requests) || requests.length === 0) {
      feed.innerHTML = `<div class="empty-state donor-feed-empty">${escapeHtml(emptyMessage)}</div>`;
      return;
    }

    feed.innerHTML = requests.map(renderRequestCard).join('');

    feed.querySelectorAll('.request-respond-btn').forEach(button => {
      button.addEventListener('click', async () => {
        const requestId = button.dataset.requestId;
        const respondUrl = button.dataset.respondUrl;
        if (!requestId || !respondUrl) return;

        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = 'Sending...';
        setStatus('Sending your response to the requester...');

        try {
          const response = await fetch(respondUrl, {
            method: 'POST',
            headers: {
              Accept: 'application/json'
            }
          });

          const payload = await response.json().catch(() => ({}));
          if (!response.ok || payload.success === false) {
            throw new Error(payload.error || 'Unable to send your response.');
          }

          setStatus(payload.message || 'Your availability has been sent.');
          await loadRequests();
        } catch (error) {
          setStatus(error.message || 'Unable to send your response.', true);
          button.disabled = false;
          button.textContent = originalText;
        }
      });
    });
  }

  async function loadRequests() {
    setStatus('Loading request feed...');

    try {
      const query = buildQuery();
      const url = query.toString() ? `${endpoint}?${query.toString()}` : endpoint;
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json'
        }
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.success === false) {
        throw new Error(payload.error || 'Unable to load requests right now.');
      }

      renderRequests(payload.requests || []);
      updateSummary(payload.summary);
      setStatus(payload.requests?.length ? `Showing ${payload.requests.length} request(s).` : emptyMessage);
    } catch (error) {
      setStatus(error.message || 'Unable to load requests right now.', true);
    }
  }

  compatibleOnlyFilter?.addEventListener('change', loadRequests);
  urgencyFilter?.addEventListener('change', loadRequests);

  setStatus('');
  loadRequests();
})();
