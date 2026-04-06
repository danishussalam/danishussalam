const WORKER_URL = 'https://voice-ai.danish-us-salam.workers.dev';

// Speech Recognition Setup
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-US';
}

// State Management
let state = {
  role: null,
  level: null,
  tone: null,
  question: null,
  followup: null,
  firstAnswer: null,
  secondAnswer: null,
  isRecording: false,
  stage: 'setup', // setup, first-answer, second-answer, results
  sessionId: null,
  questionNumber: 1,
  currentFeedback: null, // Store feedback for download
};

// DOM Elements
const roleSelect = document.getElementById('role-select');
const levelSelect = document.getElementById('level-select');
const toneSelect = document.getElementById('tone-select');
const startButton = document.getElementById('start-button');
const submitButton = document.getElementById('submit-button');
const micButton = document.getElementById('mic-button');
const repeatButton = document.getElementById('repeat-button');
const questionDisplay = document.getElementById('question-display');
const currentQuestion = document.getElementById('current-question');
const recordingState = document.getElementById('recording-state');
const recordingLabel = document.getElementById('recording-label');
const timer = document.getElementById('timer');
const resultsPanel = document.getElementById('results-panel');
const emptyState = document.getElementById('empty-state');
const errorDiv = document.getElementById('error');
const errorText = document.getElementById('error-text');
const loadingDiv = document.getElementById('loading');
const retryButton = document.getElementById('retry-button');
const restartButton = document.getElementById('restart-button');
const thankYouMessage = document.getElementById('thank-you-message');

// Event Listeners
startButton.addEventListener('click', startInterview);
submitButton.addEventListener('click', submitAnswer);
micButton.addEventListener('click', toggleRecording);
repeatButton.addEventListener('click', () => {
  if (state.question) speakText(state.stage === 'second-answer' ? state.followup : state.question);
});
retryButton.addEventListener('click', retryQuestion);
restartButton.addEventListener('click', reset);

// Download button - wait for DOM if needed
const downloadBtn = document.getElementById('download-button');
if (downloadBtn) {
  downloadBtn.addEventListener('click', downloadTranscript);
}

// Enable/disable start button based on selections
[roleSelect, levelSelect, toneSelect].forEach(select => {
  select.addEventListener('change', updateStartButtonState);
});

function updateStartButtonState() {
  const isEnabled = roleSelect.value && levelSelect.value && toneSelect.value;
  startButton.disabled = !isEnabled;
}

async function startInterview() {
  state.role = roleSelect.value;
  state.level = levelSelect.value;
  state.tone = toneSelect.value;
  state.stage = 'first-answer';
  state.sessionId = Math.random().toString(36).substring(2, 9);
  state.firstAnswer = null;
  state.secondAnswer = null;

  // Disable controls
  roleSelect.disabled = true;
  levelSelect.disabled = true;
  toneSelect.disabled = true;
  startButton.style.display = 'none';

  // Show question display
  questionDisplay.classList.remove('hidden');

  showLoading();

  try {
    // Fetch first question
    const response = await fetch(`${WORKER_URL}/question`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: state.role,
        level: state.level,
        tone: state.tone,
        sessionHistory: []
      })
    });

    if (!response.ok) throw new Error('Failed to fetch question');

    const data = await response.json();
    state.question = data.question;
    currentQuestion.textContent = `Question ${state.questionNumber}: ${state.question}`;

    // Speak question (optional, using browser TTS)
    speakText(state.question);

    // Show submit button and mic
    micButton.disabled = false;
    repeatButton.disabled = false;
    submitButton.style.display = 'block';
    submitButton.disabled = false;
    submitButton.textContent = 'Submit Answer';

    hideLoading();
  } catch (error) {
    hideLoading();
    showError('Failed to start interview. Please try again.');
  }
}

const VOICE_PRIORITY = [
  'Google US English',
  'Microsoft Aria Online (Natural) - English (United States)',
  'Microsoft Guy Online (Natural) - English (United States)',
  'Samantha',
  'Karen',
  'Daniel',
];

function getBestVoice() {
  const voices = window.speechSynthesis.getVoices();
  const enVoices = voices.filter(v => v.lang.startsWith('en'));
  for (const name of VOICE_PRIORITY) {
    const match = enVoices.find(v => v.name === name);
    if (match) return match;
  }
  return enVoices.find(v => v.lang === 'en-US') || enVoices[0] || null;
}

function speakText(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = getBestVoice();
  if (voice) utterance.voice = voice;
  utterance.rate = 0.92;
  utterance.pitch = 0.95;
  utterance.volume = 1;
  setTimeout(() => window.speechSynthesis.speak(utterance), 100);
}

function toggleRecording() {
  if (!recognition) {
    showError('Speech recognition not supported in your browser. Use Chrome or Edge.');
    return;
  }

  if (state.isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
}

// Global transcript variable for persistence
let currentTranscript = '';

function startRecording() {
  state.isRecording = true;
  currentTranscript = '';
  recordingState.classList.remove('hidden');
  micButton.style.background = '#ef4444';
  micButton.style.color = 'white';

  let seconds = 0;
  const timerInterval = setInterval(() => {
    seconds++;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    timer.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
  }, 1000);

  recognition.continuous = true; // Keep recording even during pauses
  recognition.interimResults = true;

  recognition.onstart = () => {
    recordingLabel.textContent = 'Recording... (click mic to stop)';
  };

  recognition.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) {
        currentTranscript += event.results[i][0].transcript + ' ';
      } else {
        // Show interim results for better UX
        recordingLabel.textContent = 'Recording... (click mic to stop)';
      }
    }
  };

  recognition.onerror = (event) => {
    clearInterval(timerInterval);
    showError(`Recording error: ${event.error}`);
  };

  recognition.onend = () => {
    state.isRecording = false;
    recordingState.classList.add('hidden');
    clearInterval(timerInterval);
    recognition.continuous = false;

    // Store the answer based on current stage
    const trimmedAnswer = currentTranscript.trim();
    if (state.stage === 'first-answer') {
      state.firstAnswer = trimmedAnswer;
    } else if (state.stage === 'second-answer') {
      state.secondAnswer = trimmedAnswer;
    }

    micButton.style.background = '#f0f4f8';
    micButton.style.color = '#097fe8';

    // Show submit button and thank you only after recording
    if (trimmedAnswer) {
      if (state.stage === 'first-answer') {
        // First answer: just show submit button
        submitButton.style.display = 'block';
        thankYouMessage.classList.add('hidden');
      } else if (state.stage === 'second-answer') {
        // Second answer: show thank you message and get feedback button
        thankYouMessage.classList.remove('hidden');
        submitButton.style.display = 'block';
        micButton.style.display = 'none'; // Hide mic button after second answer recorded
      }
    }
  };

  recognition.start();
}

function stopRecording() {
  if (recognition) {
    recognition.stop();
  }
  state.isRecording = false;
  recordingState.classList.add('hidden');
  micButton.style.background = '#f0f4f8';
  micButton.style.color = '#097fe8';
}

async function submitAnswer() {
  if (!state.firstAnswer && state.stage === 'first-answer') {
    showError('Please record an answer first.');
    return;
  }

  if (state.stage === 'first-answer') {
    // Get follow-up question
    state.stage = 'second-answer';
    showLoading();

    try {
      const response = await fetch(`${WORKER_URL}/followup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: state.question,
          userAnswer: state.firstAnswer
        })
      });

      if (!response.ok) throw new Error('Failed to fetch follow-up');

      const data = await response.json();
      state.followup = data.followup;
      currentQuestion.textContent = `Question ${state.questionNumber} (Follow-up): ${state.followup}`;
      speakText(state.followup);

      submitButton.textContent = 'Get Feedback';
      submitButton.style.display = 'none'; // Hide button, user needs to record second answer first
      thankYouMessage.classList.add('hidden'); // Hide thank you message
      recordingState.classList.add('hidden');
      recordingLabel.textContent = 'Recording...';

      hideLoading();
    } catch (error) {
      hideLoading();
      showError('Failed to generate follow-up. Please try again.');
      state.stage = 'first-answer';
    }
  } else if (state.stage === 'second-answer') {
    // Submit both answers for evaluation
    if (!state.secondAnswer) {
      showError('Please record your follow-up answer first.');
      return;
    }

    state.stage = 'results';
    showLoading();

    try {
      const response = await fetch(`${WORKER_URL}/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: state.role,
          level: state.level,
          question: state.question,
          followup: state.followup,
          answer1: state.firstAnswer,
          answer2: state.secondAnswer
        })
      });

      if (!response.ok) throw new Error('Failed to get evaluation');

      const data = await response.json();
      displayResults(data);

      hideLoading();
    } catch (error) {
      hideLoading();
      showError('Failed to evaluate answers. Please try again.');
      state.stage = 'second-answer';
    }
  }
}

function displayResults(data) {
  // Store feedback for download
  state.currentFeedback = {
    scores: data.scores || {},
    weaknesses: data.weaknesses || [],
    idealAnswer: data.idealAnswer || ''
  };

  // Populate scores
  const scores = data.scores || {};
  document.getElementById('score-clarity').textContent = `${scores.clarity || 7}/10`;
  document.getElementById('score-structure').textContent = `${scores.structure || 6}/10`;
  document.getElementById('score-tone').textContent = `${scores.tone || 8}/10`;
  document.getElementById('score-technical').textContent = `${scores.technical || 7}/10`;
  document.getElementById('score-confidence').textContent = `${scores.confidence || 6}/10`;

  const overall = Math.round(
    (
      (scores.clarity || 7) +
      (scores.structure || 6) +
      (scores.tone || 8) +
      (scores.technical || 7) +
      (scores.confidence || 6)
    ) / 5
  );
  document.getElementById('score-overall').textContent = `${overall}/10`;

  // Populate weaknesses
  const weaknesses = data.weaknesses || [
    'Vague on specific project metrics',
    'Lacked confidence in technical response',
    'Could have used more professional terminology'
  ];
  const weaknessesList = document.getElementById('weaknesses-list');
  weaknessesList.innerHTML = weaknesses.map(w =>
    `<li class="flex gap-2"><span class="text-red-600">•</span><span>${w}</span></li>`
  ).join('');

  // Populate improved answer
  const improvedAnswer = data.idealAnswer || 'Here is how you should have answered...';
  document.getElementById('improved-answer').textContent = improvedAnswer;

  // Show results, hide empty state and mic
  emptyState.classList.add('hidden');
  resultsPanel.classList.remove('hidden');
  micButton.disabled = true;
  micButton.style.display = 'none'; // Hide mic button after feedback is shown
  repeatButton.disabled = true;
  repeatButton.style.display = 'none';
  submitButton.style.display = 'none';
  questionDisplay.classList.add('hidden');
}

function retryQuestion() {
  // Reset for next question without going back to setup
  state.stage = 'first-answer';
  state.firstAnswer = null;
  state.secondAnswer = null;
  state.questionNumber++; // Increment question number for next question
  resultsPanel.classList.add('hidden');
  questionDisplay.classList.remove('hidden');
  submitButton.style.display = 'block';
  submitButton.disabled = false;
  submitButton.textContent = 'Submit Answer';
  micButton.disabled = false;
  micButton.style.display = 'flex'; // Show mic button again for next question
  repeatButton.disabled = false;
  repeatButton.style.display = 'flex';

  // Fetch new question
  showLoading();
  setTimeout(async () => {
    try {
      const response = await fetch(`${WORKER_URL}/question`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: state.role,
          level: state.level,
          tone: state.tone,
          sessionHistory: []
        })
      });

      if (!response.ok) throw new Error('Failed to fetch question');

      const data = await response.json();
      state.question = data.question;
      currentQuestion.textContent = state.question;
      speakText(state.question);

      hideLoading();
    } catch (error) {
      hideLoading();
      showError('Failed to load next question. Please try again.');
    }
  }, 100);
}

function reset() {
  // Full reset
  state = {
    role: null,
    level: null,
    tone: null,
    question: null,
    followup: null,
    firstAnswer: null,
    secondAnswer: null,
    isRecording: false,
    stage: 'setup',
    sessionId: null,
  };

  // Reset UI
  roleSelect.disabled = false;
  levelSelect.disabled = false;
  toneSelect.disabled = false;
  roleSelect.value = '';
  levelSelect.value = '';
  toneSelect.value = '';

  startButton.style.display = 'block';
  startButton.disabled = true;
  submitButton.style.display = 'none';
  micButton.disabled = true;
  micButton.style.background = '#f0f4f8';
  micButton.style.color = '#097fe8';
  repeatButton.disabled = true;

  questionDisplay.classList.add('hidden');
  recordingState.classList.add('hidden');
  resultsPanel.classList.add('hidden');
  emptyState.classList.remove('hidden');
  thankYouMessage.classList.add('hidden');

  window.speechSynthesis.cancel();
  errorDiv.classList.add('hidden');
}

function showLoading() {
  loadingDiv.classList.remove('hidden');
}

function hideLoading() {
  loadingDiv.classList.add('hidden');
}

function showError(message) {
  errorText.textContent = message;
  errorDiv.classList.remove('hidden');
}

function clearError() {
  errorDiv.classList.add('hidden');
}

function downloadTranscript() {
  if (!state.currentFeedback) {
    showError('No transcript available to download.');
    return;
  }

  const timestamp = new Date().toLocaleString();
  const scores = state.currentFeedback.scores;
  const overall = Math.round(
    (
      (scores.clarity || 0) +
      (scores.structure || 0) +
      (scores.tone || 0) +
      (scores.technical || 0) +
      (scores.confidence || 0)
    ) / 5
  );

  const transcript = `VOICEAI INTERVIEW TRANSCRIPT
========================================

Interview Details
-----------------
Role: ${state.role}
Level: ${state.level}
Interviewer Tone: ${state.tone}
Date & Time: ${timestamp}

Interview Transcript
--------------------

QUESTION 1:
${state.question}

YOUR ANSWER 1:
${state.firstAnswer || '(No answer recorded)'}

FOLLOW-UP QUESTION:
${state.followup}

YOUR ANSWER 2:
${state.secondAnswer || '(No answer recorded)'}

Feedback & Scores
-----------------

Overall Score: ${overall}/10

Individual Scores:
- Clarity: ${scores.clarity || 0}/10
- Structure: ${scores.structure || 0}/10
- Professional Tone: ${scores.tone || 0}/10
- Technical Depth: ${scores.technical || 0}/10
- Confidence: ${scores.confidence || 0}/10

Areas to Improve:
${state.currentFeedback.weaknesses.map((w, i) => `${i + 1}. ${w}`).join('\n')}

Ideal Answer (How You Should Have Responded):
${state.currentFeedback.idealAnswer}

========================================
End of Transcript`;

  // Create blob and download
  const blob = new Blob([transcript], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `voiceai-interview-${new Date().toISOString().split('T')[0]}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Keyboard shortcut (Ctrl+Enter to submit)
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    if (!submitButton.hidden && !submitButton.disabled) {
      submitAnswer();
    }
  }
});

// Initialization
updateStartButtonState();
