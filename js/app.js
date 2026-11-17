(() => {
  "use strict";

  const form = document.querySelector("#review-form");
  const urlInput = document.querySelector("#repository-url");
  const urlError = document.querySelector("#url-error");
  const formError = document.querySelector("#form-error");
  const notification = document.querySelector("#notification");
  const reviewButton = document.querySelector("#review-button");
  const clearButton = form.querySelector('button[type="reset"]');
  const loadCodeButton = document.querySelector("#load-code-button");
  const codePreview = document.querySelector("#github-code");
  const codeStatus = document.querySelector("#code-status");
  const buttonLabel = reviewButton.querySelector("span");
  const loadingMessage = document.querySelector("#loading-message");
  const results = document.querySelector("#results");
  const languageInput = document.querySelector("#language");
  const reviewTypeInput = document.querySelector("#review-type");
  const supportedLanguages = ["Java", "JavaScript", "TypeScript", "Python"];
  const supportedReviewTypes = [
    "Full Review",
    "Code Quality",
    "Security",
    "Performance",
    "Best Practices",
  ];
  const maxCodeLength = 500000;
  const n8nWebhookUrl =
    "http://localhost:5678/webhook/github_code_reviewer";
  const instructionsInput = document.querySelector("#instructions");
  const qualityScore = document.querySelector("#quality-score");
  const scoreMeter = document.querySelector("#score-meter");
  const scoreMeterFill = document.querySelector("#score-meter-fill");
  const scoreCaption = document.querySelector("#score-caption");
  const issueCount = document.querySelector("#issue-count");
  const issueCaption = document.querySelector("#issue-caption");
  const resultFocus = document.querySelector("#result-focus");
  const workflowReport = document.querySelector("#workflow-report");

  function setUrlError(message) {
    urlInput.setAttribute("aria-invalid", "true");
    urlError.textContent = message;
    urlError.hidden = false;
  }

  function clearUrlError() {
    urlInput.removeAttribute("aria-invalid");
    urlError.textContent = "";
    urlError.hidden = true;
  }

  function validateGitHubUrl(value) {
    const trimmedValue = value.trim();

    if (!trimmedValue) {
      return "Enter a GitHub repository or file URL to start your review.";
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(trimmedValue);
    } catch {
      return "Enter a valid URL, such as https://github.com/owner/repository.";
    }

    if (
      parsedUrl.protocol !== "https:" ||
      parsedUrl.hostname !== "github.com" ||
      parsedUrl.username ||
      parsedUrl.password ||
      parsedUrl.port
    ) {
      return "Use a public GitHub link that starts with https://github.com/.";
    }

    const pathParts = parsedUrl.pathname.split("/").filter(Boolean);
    if (pathParts.length < 2) {
      return "Include both the GitHub account name and repository name in the URL.";
    }

    return "";
  }

  function showFormError(message) {
    formError.textContent = message;
    formError.hidden = false;
  }

  function clearFormError() {
    formError.textContent = "";
    formError.hidden = true;
  }

  function showNotification(message, type) {
    notification.textContent = message;
    notification.className = `notification notification--${type}`;
    notification.setAttribute("role", type === "error" ? "alert" : "status");
    notification.setAttribute("aria-live", type === "error" ? "assertive" : "polite");
    notification.hidden = false;
  }

  function clearNotification() {
    notification.textContent = "";
    notification.className = "notification";
    notification.setAttribute("role", "status");
    notification.setAttribute("aria-live", "polite");
    notification.hidden = true;
  }

  function setCodeStatus(message, type) {
    codeStatus.textContent = message;
    codeStatus.className = `code-status code-status--${type}`;
    codeStatus.setAttribute("role", type === "error" ? "alert" : "status");
    codeStatus.setAttribute("aria-live", type === "error" ? "assertive" : "polite");
    codeStatus.hidden = false;
  }

  function clearCodeStatus() {
    codeStatus.textContent = "";
    codeStatus.className = "code-status";
    codeStatus.setAttribute("role", "status");
    codeStatus.setAttribute("aria-live", "polite");
    codeStatus.hidden = true;
  }

  function setLoading(isLoading) {
    reviewButton.disabled = isLoading;
    clearButton.disabled = isLoading;
    loadCodeButton.disabled = isLoading;
    buttonLabel.textContent = isLoading ? "Reviewing..." : "Review code";
    loadingMessage.hidden = !isLoading;
  }

  function setCodeLoading(isLoading) {
    loadCodeButton.disabled = isLoading;
    reviewButton.disabled = isLoading;
    clearButton.disabled = isLoading;
    loadCodeButton.textContent = isLoading ? "Loading..." : "Load code";
  }

  function getGitHubFileSource(value) {
    try {
      const parsedUrl = new URL(value.trim());
      const pathParts = parsedUrl.pathname.split("/").filter(Boolean);
      if (parsedUrl.hostname !== "github.com" || pathParts[2] !== "blob") {
        return null;
      }

      const owner = decodeURIComponent(pathParts[0] || "");
      const repository = decodeURIComponent(pathParts[1] || "");
      let branch;
      let fileParts;

      if (pathParts[3] === "refs" && pathParts[4] === "heads") {
        branch = decodeURIComponent(pathParts[5] || "");
        fileParts = pathParts.slice(6).map(decodeURIComponent);
      } else {
        branch = decodeURIComponent(pathParts[3] || "");
        fileParts = pathParts.slice(4).map(decodeURIComponent);
      }

      if (
        !owner ||
        !repository ||
        !branch ||
        !fileParts.length ||
        owner.includes("/") ||
        repository.includes("/") ||
        fileParts.some((part) => part === "." || part === "..")
      ) {
        return null;
      }

      const branchPath = branch.split("/").map(encodeURIComponent).join("/");
      const filePath = fileParts.map(encodeURIComponent).join("/");
      const rawUrl =
        `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/` +
        `${encodeURIComponent(repository)}/${branchPath}/${filePath}`;

      return { rawUrl, filePath: fileParts.join("/") };
    } catch {
      return null;
    }
  }

  async function loadGitHubCode() {
    clearFormError();
    clearNotification();
    clearCodeStatus();

    const validationMessage = validateGitHubUrl(urlInput.value);
    if (validationMessage) {
      setUrlError(validationMessage);
      setCodeStatus(validationMessage, "error");
      showNotification(validationMessage, "error");
      urlInput.focus();
      return;
    }
    clearUrlError();

    const source = getGitHubFileSource(urlInput.value);
    if (!source) {
      const message =
        "Use a GitHub file URL with /blob/branch/path to load source code.";
      setCodeStatus(message, "error");
      showNotification(message, "error");
      return;
    }

    codePreview.value = "";
    setCodeLoading(true);
    setCodeStatus("Loading source code from GitHub...", "loading");

    let failureMessage =
      "Could not load the code. Check your connection and make sure the file is public.";
    try {
      const response = await fetch(source.rawUrl, {
        headers: { Accept: "text/plain" },
      });

      if (response.status === 404) {
        failureMessage = "That public GitHub file could not be found.";
        throw new Error(failureMessage);
      }
      if (!response.ok) {
        failureMessage = `GitHub could not load this file (HTTP ${response.status}).`;
        throw new Error(failureMessage);
      }

      const contentLength = Number(response.headers.get("content-length"));
      if (contentLength > maxCodeLength) {
        failureMessage = "This file is too large to preview (maximum 500 KB).";
        throw new Error(failureMessage);
      }

      const code = await response.text();
      if (code.length > maxCodeLength) {
        failureMessage = "This file is too large to preview (maximum 500 KB).";
        throw new Error(failureMessage);
      }

      codePreview.value = code;
      setCodeStatus(`Loaded ${source.filePath}`, "success");
      showNotification("GitHub source loaded into the code preview.", "success");
    } catch (error) {
      console.error("Unable to load public GitHub source code:", error);
      setCodeStatus(failureMessage, "error");
      showNotification(failureMessage, "error");
    } finally {
      setCodeLoading(false);
    }
  }

  function extractWorkflowReport(responseBody) {
    if (
      responseBody &&
      !Array.isArray(responseBody) &&
      typeof responseBody.review === "string" &&
      responseBody.review.trim()
    ) {
      return responseBody.review.trim();
    }

    if (
      Array.isArray(responseBody) &&
      responseBody.length === 1 &&
      responseBody[0] &&
      typeof responseBody[0].text === "string" &&
      responseBody[0].text.trim()
    ) {
      return responseBody[0].text.trim();
    }

    throw new Error(
      'The n8n response must contain a non-empty "review" field.',
    );
  }

  async function sendReviewToN8n(payload) {
    const response = await fetch(n8nWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(
          "n8n returned 404. Check the webhook path and, for a /webhook-test/ URL, click Execute workflow before submitting.",
        );
      }
      throw new Error(`The n8n webhook returned HTTP ${response.status}.`);
    }

    let responseBody;
    try {
      responseBody = await response.json();
    } catch {
      throw new Error("The n8n webhook response was not valid JSON.");
    }

    return extractWorkflowReport(responseBody);
  }

  function renderWorkflowResults(report, language, reviewType) {
    const plainReport = report.replace(/\*\*/g, "");
    const scoreMatch = plainReport.match(
      /overall score\s*:\s*(\d{1,3})\s*\/\s*100/i,
    );
    const score = scoreMatch ? Number(scoreMatch[1]) : null;
    const hasScore = Number.isInteger(score) && score >= 0 && score <= 100;

    qualityScore.textContent = hasScore ? String(score) : "—";
    scoreMeter.hidden = !hasScore;
    scoreCaption.hidden = hasScore;
    if (hasScore) {
      scoreMeter.setAttribute("aria-valuenow", String(score));
      scoreMeterFill.style.width = `${score}%`;
    } else {
      scoreCaption.textContent = "No overall score was found in the workflow response.";
    }

    issueCount.textContent = "—";
    issueCaption.textContent = "Not returned by the workflow";
    resultFocus.textContent = `${reviewType} · ${language}`;
    workflowReport.textContent = report;
    results.hidden = false;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    clearFormError();
    clearNotification();

    const validationMessage = validateGitHubUrl(urlInput.value);
    if (validationMessage) {
      setUrlError(validationMessage);
      showNotification(validationMessage, "error");
      urlInput.focus();
      return;
    }
    clearUrlError();

    const language = languageInput.value;
    const reviewType = reviewTypeInput.value;
    if (
      !supportedLanguages.includes(language) ||
      !supportedReviewTypes.includes(reviewType)
    ) {
      const message = "Choose a supported programming language and review focus.";
      showFormError(message);
      showNotification(message, "error");
      return;
    }

    if (!codePreview.value.trim()) {
      const message = "Load a public GitHub file before sending a review to n8n.";
      showFormError(message);
      showNotification(message, "error");
      loadCodeButton.focus();
      return;
    }

    setLoading(true);
    try {
      const report = await sendReviewToN8n({
        data: codePreview.value,
        repositoryUrl: urlInput.value.trim(),
        language,
        reviewType,
        instructions: instructionsInput.value.trim(),
      });
      renderWorkflowResults(report, language, reviewType);
      showNotification("Your code review was returned by the n8n workflow.", "success");
      results.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      console.error("Unable to complete the n8n code review:", error);
      const message =
        error instanceof TypeError
          ? "The browser couldn't call n8n. Set the Webhook node method to POST and allow http://localhost:8000 in its CORS settings."
          : error instanceof Error
            ? error.message
            : "The n8n code review failed. Check the workflow and try again.";
      showFormError(message);
      showNotification(message, "error");
    } finally {
      setLoading(false);
    }
  }

  urlInput.addEventListener("input", () => {
    if (urlInput.value.trim()) {
      clearUrlError();
    }
    codePreview.value = "";
    clearCodeStatus();
    clearNotification();
  });

  loadCodeButton.addEventListener("click", loadGitHubCode);
  form.addEventListener("submit", handleSubmit);
  form.addEventListener("reset", () => {
    clearUrlError();
    clearFormError();
    clearNotification();
    codePreview.value = "";
    clearCodeStatus();
    results.hidden = true;
  });
})();
