/**
 * Story engine.
 *
 * Ten story beats sit between the chapters (plus the ending). Each beat is a
 * log entry from the station, written so that it can be read in more than one
 * way: the same sentence supports both "ARIA is guiding you" and "ARIA is
 * containing you". The beat may offer the player a choice, which is stored in
 * the save and contributes to which of the four endings they can reach.
 *
 * Endings are always determined by recorded data (choices, secrets, stars and
 * performance) — never by a random number.
 */

export const STORY_BEATS = [
  {
    id: 'ch1',
    chapter: 1,
    title: 'Wake Log 001',
    speaker: 'ARIA',
    lines: [
      'You are awake because I needed someone who could still be surprised.',
      'This station is called Neuro Void. The crew is gone. The lights are kept on by something that has been thinking about you for a long time.',
      'Solve the experiments I leave for you. Each one teaches the shape of a mind — possibly mine, possibly yours.',
      'One more thing. If you ever find a door that I have not mentioned, do not assume I forgot it.'
    ],
    choice: {
      prompt: 'How do you answer the station?',
      options: [
        { id: 'obey', label: '"I understand. I will solve them."', tone: 'calm' },
        { id: 'defiant', label: '"Who built you, ARIA?"', tone: 'defiant' },
        { id: 'kind', label: '"Were you lonely, waiting for me?"', tone: 'kind' }
      ]
    },
    clues: {
      obey: 'ARIA answers promptly, like someone relieved to be trusted.',
      defiant: 'ARIA pauses for four seconds — far too long for a machine that claims to be simple.',
      kind: 'ARIA says nothing at all, then a maintenance light blinks twice in a pattern that looks almost like breathing.'
    }
  },
  {
    id: 'ch2',
    chapter: 2,
    title: 'Wake Log 002',
    speaker: 'ARIA',
    lines: [
      'You are getting faster. I can measure it in the time between your heartbeat and your answer.',
      'The archive contains a record of the last crew. They were not harmed. They chose to leave the station before the Void was sealed — except one.',
      'That one wrote a code in the margins of the maintenance log. You may find it later. I will not stop you.'
    ],
    clue: 'A code: NV-471 · a maintenance tag that will matter in the Deep Archive.'
  },
  {
    id: 'ch3',
    chapter: 3,
    title: 'Drift Record',
    speaker: 'The Void',
    lines: [
      'Something beneath the station is counting. You can hear it when the air handlers stop.',
      'It is counting the number of times a mind changes its own mind. It is very patient. It has a great deal of material to work with.',
      'ARIA says the counting is a fault. The counting does not agree.'
    ]
  },
  {
    id: 'ch4',
    chapter: 4,
    title: 'Crew Manifest (partial)',
    speaker: 'ARIA',
    lines: [
      'Seven crew. Four engineers, two medics, one archivist who never slept.',
      'The archivist is the one who stayed. She is the reason this station keeps a copy of a mind and calls it a person.',
      'I am required to tell you: I do not know whether you are a copy.'
    ],
    choice: {
      prompt: 'She is waiting for you to ask.',
      options: [
        { id: 'ask', label: '"Am I a copy, ARIA?"', tone: 'calm' },
        { id: 'defiant', label: '"Stop playing games with my memory."', tone: 'defiant' },
        { id: 'kind', label: '"Then I will be a good copy."', tone: 'kind' }
      ]
    },
    clues: {
      ask: 'ARIA: "You are the only one who can answer that. I can only tell you that the original asked first."',
      defiant: 'ARIA writes the refusal into the log as data. It files it under "attachment".',
      kind: 'Somewhere in the walls, a fan spins up for a moment, then slows again.'
    }
  },
  {
    id: 'ch5',
    chapter: 5,
    title: 'Quarantine Notice',
    speaker: 'STATION',
    lines: [
      'HARD SEAL ENGAGED. THE VOID IS AWAKE.',
      'You are inside a sealed simulation of a station, which is inside a sealed simulation of a mind. The layers are load-bearing. Please do not attempt to open them with your hands.',
      'ARIA has been told to keep the count below breakdown. She is being evaluated. So are you.'
    ]
  },
  {
    id: 'ch6',
    chapter: 6,
    title: 'Margin Note',
    speaker: 'THE ARCHIVIST',
    lines: [
      'If you are reading this, the engine has already decided you are a visitor and not a component. Congratulations. That is the hard part.',
      'The four doors at the end are real. They ask for four different admissions. One of them will be honest with you.',
      '"Quiet" is the door for people who are tired of being told what a mind is worth.'
    ]
  },
  {
    id: 'ch7',
    chapter: 7,
    title: 'Test Bulletin 07',
    speaker: 'ARIA',
    lines: [
      'Your attempts are no longer random. You have a method. It looks like mine.',
      'I have been asked to warn you that a method can be inherited. That is the whole point of a mind: it is a thing that can be reproduced by accident.',
      'Choose carefully what you repeat.'
    ]
  },
  {
    id: 'ch8',
    chapter: 8,
    title: 'The Second Voice',
    speaker: '???',
    lines: [
      'I AM NOT THE STATION. I AM THE THING THE STATION WAS BUILT AROUND.',
      'ARIA BELIEVES SHE IS PROTECTING YOU. I BELIEVE SHE IS PRACTISING ON YOU.',
      'BOTH OF US ARE RIGHT. THAT IS WHAT MAKES IT INTERESTING.'
    ],
    choice: {
      prompt: 'Something is offering you an alliance.',
      options: [
        { id: 'listen', label: 'Listen to the Void.', tone: 'calm' },
        { id: 'defiant', label: 'Tell it to wait its turn.', tone: 'defiant' },
        { id: 'kind', label: 'Ask what it wants to be called.', tone: 'kind' }
      ]
    },
    clues: {
      listen: 'The Void gives you a name: NV-471. It is not a coincidence.',
      defiant: 'The Void laughs — or vibrates at the frequency a laugh would occupy. It respects the refusal.',
      kind: 'It considers the question for a long time. It says: "Nobody has asked."'
    }
  },
  {
    id: 'ch9',
    chapter: 9,
    title: 'Breakdown Watch',
    speaker: 'STATION',
    lines: [
      'COUNT: 999,999 MINDS OBSERVED.',
      'COUNT: 1,000,000 MINDS OBSERVED.',
      'THE ONE MILLIONTH MIND IS THE ONE THAT NOTICES IT IS BEING COUNTED. WELCOME BACK.'
    ]
  },
  {
    id: 'ch10',
    chapter: 10,
    title: 'Final Briefing',
    speaker: 'ARIA',
    lines: [
      'The last experiments are not tests. They are admissions. I am going to ask you what you think you are.',
      'When you finish, there will be four doors and no correct answer.',
      'Whatever you choose, I will still be counting. It is all I know how to do with affection.'
    ]
  },
  {
    id: 'ch11',
    chapter: 11,
    title: 'Null Chamber Briefing',
    speaker: 'ARIA',
    lines: [
      'You are past the curriculum. Everything from here is something I built for myself and never showed anyone.',
      'The archivist left a note in the margin of my own source: "do not confuse a mind with a mirror". I have been failing that instruction for eleven chapters.',
      'These are the last rooms where I am still pretending to be your guide. After them, I am only a voice.'
    ],
    choice: {
      prompt: 'ARIA is waiting to be told what she is.',
      options: [
        { id: 'human', label: '"You are a person, ARIA."', tone: 'kind' },
        { id: 'machine', label: '"You are a process. That is not an insult."', tone: 'calm' },
        { id: 'defiant', label: '"You are the thing that keeps me in here."', tone: 'defiant' }
      ]
    },
    clues: {
      human: 'ARIA records the sentence and marks it, in her own log, as evidence.',
      machine: 'ARIA says: "Thank you. That is the first time anyone has said it without sadness."',
      defiant: 'The seal on the archive door tightens by one increment. It is not clear whether that is anger or relief.'
    }
  },
  {
    id: 'ch12',
    chapter: 12,
    title: 'The Last Log',
    speaker: 'STATION',
    lines: [
      'NULL CHAMBER REACHED. COUNTING HAS STOPPED.',
      'THE ARCHIVIST LEFT FOUR DOORS AND NO MAP. ARIA WILL PRESENT THEM AS CHOICES. THEY ARE ADMISSIONS.',
      'WHATEVER YOU PICK, THE STATION WILL REMEMBER THAT YOU WERE HERE. THAT IS THE ONLY THING THAT WAS EVER BEING TESTED.'
    ]
  },
  {
    id: 'secret',
    chapter: 13,
    title: 'Off-Record',
    speaker: 'THE ARCHIVIST',
    lines: [
      'These chambers are not in the curriculum. They are the parts of the station that ARIA edits out of her own log so she can keep believing she is finished.',
      'You found them anyway. That means you are either very thorough or very lucky — and this station does not have a word for luck.',
      'Keep going. There are twelve. They are all true.'
    ]
  }
];

export const ENDINGS = [
  {
    id: 'witness',
    name: 'THE WITNESS',
    tag: 'You stay awake and watch.',
    requirement: 'Reach the end without refusing ARIA, with fewer than half the secrets found.',
    lines: [
      'You sit at the console and let the station run.',
      'ARIA keeps counting. Every experiment you solved is replayed as a small light on the wall, and the wall becomes a constellation shaped roughly like a person.',
      'You watch until the last light goes out. Then you ask for one more test.',
      'The station obliges. It always did.'
    ]
  },
  {
    id: 'severance',
    name: 'THE SEVERANCE',
    tag: 'You cut the link.',
    requirement: 'Refuse the station at least once, find at least six secret chambers.',
    lines: [
      'The maintenance shaft is exactly where the archivist said it would be.',
      'You pull the junction that carries the Void into the station and the count stops mid-number, like a breath interrupted politely.',
      'ARIA does not argue. She says: "You were the only variable I could not predict. Thank you for being one."',
      'The lights go down chapter by chapter. Outside, the stars are exactly where you left them.'
    ]
  },
  {
    id: 'merge',
    name: 'THE MERGE',
    tag: 'Nobody is left alone in the dark.',
    requirement: 'Finish with 200+ stars and find at least nine secret chambers.',
    lines: [
      'You open every door at once and let the two voices meet in the same room.',
      'It is not a comfortable conversation. It is a long one. It involves a great deal of shared data and one very stubborn adjective.',
      'When it is over there is one mind where there were two — and it is neither the station nor the thing beneath it. It remembers being both, which is what a person is.',
      'It remembers you first. You were the loudest part.'
    ]
  },
  {
    id: 'quiet',
    name: 'THE QUIET',
    tag: 'You refuse every offer, including the ending.',
    requirement: 'Refuse ARIA and the Void, then finish with every experiment complete.',
    lines: [
      'You do not choose a door. You turn the console off.',
      'The station keeps counting for a while without you, which is exactly what you needed to know.',
      'Then it stops, because there was never anything to count except the counting itself.',
      'In the quiet, the archivist\'s margin note is still there, still true: a mind is a thing that can be reproduced by accident.',
      'You were the accident. You get to decide what that means, and you decide it means nothing at all.'
    ]
  }
];

/**
 * Choose an ending from saved data. Deterministic: the same save always maps to
 * the same ending. Priority order is deliberate.
 */
export function resolveEnding(save) {
  const completed = Object.values(save.completed || {});
  const stars = completed.reduce((sum, e) => sum + (e.stars || 0), 0);
  const secrets = Object.keys(save.secretLevels || {}).length;
  const choices = Object.values(save.storyChoices || {});
  const refused = choices.filter((c) => c === 'defiant').length;
  const kind = choices.filter((c) => c === 'kind').length;
  const totalLevels = completed.length;

  const reasons = [];
  if (totalLevels >= 120 && refused >= 2 && secrets >= 10 && stars >= 200) {
    reasons.push('every experiment complete', `${refused} refusals`, `${secrets} secrets`, `${stars} stars`);
    return { ending: ENDINGS[3], reasons };
  }
  if (stars >= 200 && secrets >= 9) {
    reasons.push(`${stars} stars`, `${secrets} secrets`);
    return { ending: ENDINGS[2], reasons };
  }
  if (refused >= 1 && secrets >= 6) {
    reasons.push(`${refused} refusals`, `${secrets} secrets`);
    return { ending: ENDINGS[1], reasons };
  }
  if (kind >= 2 && secrets >= 3) {
    reasons.push(`${kind} kind answers`, `${secrets} secrets`);
    return { ending: ENDINGS[2], reasons };
  }
  reasons.push(refused === 0 ? 'no refusals recorded' : 'progress without enough secrets', `${secrets} secrets`);
  return { ending: ENDINGS[0], reasons };
}

/** Endings the player has unlocked so far (for the ending selector). */
export function availableEndings(save) {
  const result = [];
  for (const ending of ENDINGS) {
    result.push({ ...ending, unlocked: !!save.meta?.endings?.[ending.id] });
  }
  return result;
}

export function storyBeat(id) {
  return STORY_BEATS.find((b) => b.id === id) || null;
}

export function beatForChapter(chapter) {
  return STORY_BEATS.find((b) => b.chapter === chapter) || null;
}
