/** Dynamic greeting based on time of day. Changes each refresh via seeded rotation. */

const GREETINGS = [
  { range: [5, 12], text: 'Good morning', emoji: '☀️' },
  { range: [12, 17], text: "Hope your day's going well", emoji: '🌸' },
  { range: [17, 21], text: 'Good evening', emoji: '🌙' },
  { range: [21, 24], text: 'Still awake?', emoji: '😊' },
  { range: [0, 5], text: 'Still awake?', emoji: '😊' },
];

export function getGreeting(): { text: string; emoji: string } {
  const hour = new Date().getHours();
  for (const g of GREETINGS) {
    if (hour >= g.range[0] && hour < g.range[1]) {
      return g;
    }
  }
  return GREETINGS[0];
}

const PLACEHOLDERS = [
  "What's on your mind?",
  'Need help with something?',
  "Let's think together.",
  'Tell me about your day.',
  "I'm listening.",
  'Ask me anything.',
];

let placeholderIndex = -1;

export function getPlaceholder(): string {
  // Rotate through placeholders without repeating consecutively
  placeholderIndex = (placeholderIndex + 1) % PLACEHOLDERS.length;
  return PLACEHOLDERS[placeholderIndex];
}

export function getInitialPlaceholder(): string {
  // Pick a random one for initial render
  return PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)];
}
