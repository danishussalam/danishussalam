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
};

// DOM Elements
const roleSelect = document.getElementById('role-select');
const levelSelect = document.getElementById('level-select');
const toneSelect = document.getElementById('tone-select');
const startButton = document.getElementById('start-button');
const submitButton = document.getElementById('submit-button');
const micButton = document.getElementById('mic-button');
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

// Event Listeners
startButton.addEventListener('click', startInterview);
submitButton.addEventListener('click', submitAnswer);
micButton.addEventListener('click', toggleRecording);
retryButton.addEventListener('click', retryQuestion);
restartButton.addEventListener('click', reset);

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
  startButton.hidden = true;

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
    currentQuestion.textContent = state.question;

    // Speak question (optional, using browser TTS)
    speakText(state.question);

    // Show submit button and mic
    micButton.disabled = false;
    submitButton.hidden = false;
    submitButton.textContent = 'Submit Answer';

    hideLoading();
  } catch (error) {
    hideLoading();
    showError('Failed to start interview. Please try again.');
  }
}

function speakText(text) {
  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;
    window.speechSynthesis.cancel(); // Cancel any ongoing speech
    window.speechSynthesis.speak(utterance);
  }
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

function startRecording() {
  state.isRecording = true;
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

  let fullTranscript = '';

  recognition.onstart = () => {
    recordingLabel.textContent = 'Recording...';
  };

  recognition.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) {
        fullTranscript += event.results[i][0].transcript + ' ';
      }
    }
  };

  recognition.onerror = (event) => {
    showError(`Recording error: ${event.error}`);
    stopRecording();
    clearInterval(timerInterval);
  };

  recognition.onend = () => {
    state.isRecording = false;
    recordingState.classList.add('hidden');
    clearInterval(timerInterval);
    state.firstAnswer = fullTranscript.trim();
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
      currentQuestion.textContent = state.followup;
      speakText(state.followup);

      submitButton.textContent = 'Get Feedback';
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
  // Populate scores
  const scores = data.scores || {};
  document.getElementById('score-clarity').textContent = `${scores.clarity || 7}/10`;
  document.getElementById('score-structure').textContent = `${scores.structure || 6}/10`;
  document.getElementById('score-tone').textContent = `${scores.tone || 8}/10`;
  document.getElementById('score-technical').textContent = `${scores.technical || 7}/10`;

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
  submitButton.hidden = true;
  questionDisplay.classList.add('hidden');
}

function retryQuestion() {
  // Reset for next question without going back to setup
  state.stage = 'first-answer';
  state.firstAnswer = null;
  state.secondAnswer = null;
  resultsPanel.classList.add('hidden');
  questionDisplay.classList.remove('hidden');
  submitButton.hidden = false;
  submitButton.textContent = 'Submit Answer';
  micButton.disabled = false;

  // Fetch new question
  startInterview();
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

  startButton.hidden = false;
  startButton.disabled = true;
  submitButton.hidden = true;
  micButton.disabled = true;
  micButton.style.background = '#f0f4f8';
  micButton.style.color = '#097fe8';

  questionDisplay.classList.add('hidden');
  recordingState.classList.add('hidden');
  resultsPanel.classList.add('hidden');
  emptyState.classList.remove('hidden');

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

// Handle recognition end to capture final answer
recognition.onend = () => {
  if (state.stage === 'first-answer') {
    // First answer captured
  } else if (state.stage === 'second-answer') {
    // Second answer captured
  }
};
