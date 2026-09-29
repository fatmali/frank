import '@fontsource-variable/recursive';
import './styles.css';

const decisions = {
  redis: {
    question: 'Are you running more than one instance?',
    receipt: 'I looked. There is no Redis in this repo or its docker-compose.',
    verdict: 'One instance? Use memory. The plan invented an operations problem.',
  },
  health: {
    question: 'Should the load balancer get rate-limited too?',
    receipt: 'The plan applies middleware to every route, including /health.',
    verdict: 'Exclude /health. A throttled health check makes healthy servers look dead.',
  },
  dependency: {
    question: 'Is one dependency worth deleting thirty lines of home-grown code?',
    receipt: 'express-rate-limit is new here, but it replaces custom quota machinery.',
    verdict: 'Keep it. Boring, maintained code is a good trade this time.',
  },
};

const tabs = [...document.querySelectorAll('.decision-tab')];
const question = document.querySelector('#decision-question');
const receipt = document.querySelector('#decision-receipt');
const verdict = document.querySelector('#decision-verdict');
const press = document.querySelector('.plan-press');
const passButton = document.querySelector('#run-pass');
const density = document.querySelector('.plan-density');

for (let index = 0; index < 47; index += 1) {
  const line = document.createElement('i');
  line.style.setProperty('--line', String(index));
  if ([16, 30, 35].includes(index)) line.classList.add('matters');
  density.append(line);
}

function selectDecision(selected) {
  const content = decisions[selected];
  if (!content) return;

  for (const tab of tabs) {
    const active = tab.dataset.decision === selected;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-pressed', String(active));
  }

  question.textContent = content.question;
  receipt.textContent = content.receipt;
  verdict.textContent = content.verdict;
}

for (const tab of tabs) {
  tab.addEventListener('click', () => selectDecision(tab.dataset.decision));
}

passButton.addEventListener('click', () => {
  press.classList.remove('is-printing');
  press.setAttribute('aria-busy', 'true');
  passButton.disabled = true;
  passButton.textContent = 'Finding the calls…';

  requestAnimationFrame(() => {
    requestAnimationFrame(() => press.classList.add('is-printing'));
  });

  window.setTimeout(() => {
    press.removeAttribute('aria-busy');
    passButton.disabled = false;
    passButton.textContent = 'Run that pass again';
    selectDecision('redis');
  }, 1250);
});

selectDecision('redis');
