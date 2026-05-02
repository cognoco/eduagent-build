/* global React */

// ─── Design tokens used across mocks ──────────────────────────────────────
// Mirror your existing teen dark theme but tuned for hierarchy + warmth.
const T = {
  bg: '#16162E',
  bgDeep: '#0F0F26',
  surface: '#22224A',
  surfaceElev: '#2A2A56',
  surfaceHi: '#33336A',
  line: '#2E2E5C',
  text: '#F4F4F8',
  textSec: '#A0A0C0',
  textMute: '#6E6E92',
  primary: '#2DD4BF',
  primarySoft: 'rgba(45,212,191,0.14)',
  primaryDeep: '#0E8F80',
  accent: '#A78BFA',
  warn: '#EAB308',
  weak: '#F97316',
  danger: '#EF4444',
  good: '#22C55E',
  fading: '#EAB308',
};

const FONT = "'Atkinson Hyperlegible', -apple-system, system-ui, sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, monospace";

// ─── Shared bits ──────────────────────────────────────────────────────────
function Screen({ children, bg = T.bg }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: bg,
        color: T.text,
        fontFamily: FONT,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
  );
}

function StatusBar({ dark }) {
  return (
    <div
      style={{
        height: 44,
        paddingTop: 16,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '14px 22px 0',
        fontFamily: FONT,
        fontSize: 14,
        fontWeight: 600,
        color: dark ? '#fff' : '#000',
        flexShrink: 0,
      }}
    >
      <span>9:41</span>
      <span style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
        <span style={{ fontSize: 11 }}>●●●●●</span>
        <span>􀙇</span>
        <span
          style={{
            width: 22,
            height: 11,
            border: `1.5px solid ${dark ? '#fff' : '#000'}`,
            borderRadius: 3,
            position: 'relative',
          }}
        >
          <span
            style={{
              position: 'absolute',
              inset: 1,
              background: dark ? '#fff' : '#000',
              width: '85%',
              borderRadius: 1,
            }}
          />
        </span>
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// HOME — CURRENT
// ═══════════════════════════════════════════════════════════════════════════
// eslint-disable-next-line no-unused-vars
function HomeCurrent() {
  const cards = [
    {
      title: 'Continue',
      sub: 'Pick up Algebra · Linear equations',
      icon: '▶',
      highlight: true,
    },
    {
      title: 'Try the new daily quiz',
      sub: 'A 60-second recall warm-up. Tap to start.',
      icon: '✨',
      highlight: true,
      dismiss: true,
    },
    { title: 'Learn', sub: 'Start a new subject or pick one', icon: '📖' },
    { title: 'Ask', sub: 'Get answers to any question', icon: '💬' },
    {
      title: 'Practice',
      sub: 'Games and reviews to sharpen what you know',
      icon: '🎮',
    },
    { title: 'Homework', sub: 'Snap a photo, get help', icon: '📷' },
  ];

  return (
    <Screen>
      <StatusBar dark />
      <div
        style={{
          padding: '12px 20px 0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
        }}
      >
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Good evening, Sam</div>
          <div style={{ fontSize: 15, color: T.textSec, marginTop: 2 }}>
            Ready for a quick session?
          </div>
        </div>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            background: T.primary,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: T.bg,
            fontWeight: 700,
          }}
        >
          S
        </div>
      </div>
      <div
        style={{
          flex: 1,
          padding: '20px 20px 0',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          overflow: 'hidden',
        }}
      >
        {cards.map((c, i) => (
          <div
            key={i}
            style={{
              background: c.highlight ? T.primarySoft : T.surfaceElev,
              borderLeft: `4px solid ${T.primary}`,
              borderRadius: 14,
              padding: '18px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              minHeight: 72,
            }}
          >
            <div style={{ fontSize: 22 }}>{c.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{c.title}</div>
              <div style={{ fontSize: 13, color: T.textSec, marginTop: 2 }}>
                {c.sub}
              </div>
            </div>
            <div style={{ color: T.primary, fontSize: 18 }}>›</div>
          </div>
        ))}
      </div>
      <div
        style={{
          height: 60,
          background: T.surface,
          borderTop: `1px solid ${T.line}`,
          display: 'flex',
          justifyContent: 'space-around',
          alignItems: 'center',
          flexShrink: 0,
        }}
      >
        {['Home', 'Library', 'Progress', 'More'].map((l, i) => (
          <div
            key={l}
            style={{ fontSize: 11, color: i === 0 ? T.primary : T.textMute }}
          >
            {l}
          </div>
        ))}
      </div>
    </Screen>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// HOME — IMPROVED
// "Coach, not tool" — the AI's thinking is the hero, not a list of buttons.
// ═══════════════════════════════════════════════════════════════════════════
function HomeImproved() {
  return (
    <Screen bg={T.bgDeep}>
      <StatusBar dark />

      {/* Compact header — name moves to the avatar tap-target */}
      <div
        style={{
          padding: '8px 22px 4px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            fontSize: 13,
            color: T.textMute,
            letterSpacing: 0.4,
            textTransform: 'uppercase',
            fontWeight: 600,
          }}
        >
          Tuesday · Evening
        </div>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            background: T.surfaceElev,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            fontWeight: 700,
            border: `1.5px solid ${T.primary}`,
          }}
        >
          S
        </div>
      </div>

      {/* HERO: the coach's plan for tonight. One specific recommendation. */}
      <div style={{ padding: '14px 22px 6px', fontSize: '20px' }}>
        <div
          style={{
            fontSize: 26,
            fontWeight: 700,
            lineHeight: 1.2,
            color: T.text,
          }}
        >
          Hi Sam. Tonight let's revisit{' '}
          <span style={{ color: T.primary }}>linear equations</span> — you were
          close on Thursday.
        </div>
      </div>

      {/* Primary CTA: huge, single, unambiguous */}
      <div style={{ padding: '14px 22px 6px' }}>
        <div
          style={{
            background: T.primary,
            color: T.bg,
            borderRadius: 18,
            padding: '16px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: `0 8px 24px ${T.primarySoft}`,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                opacity: 0.7,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              Continue · 4 min left
            </div>
            <div style={{ fontSize: 19, fontWeight: 700, marginTop: 4 }}>
              Solving for x — apply step
            </div>
          </div>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              background: T.bg,
              color: T.primary,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
              fontWeight: 700,
            }}
          >
            ▶
          </div>
        </div>
      </div>

      {/* Memory strip: what the AI remembers, surfaced. The differentiator made visible. */}
      <div style={{ padding: '12px 22px 4px' }}>
        <div
          style={{
            fontSize: 12,
            color: T.textMute,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            fontWeight: 700,
            marginBottom: 8,
          }}
        >
          What I remember
        </div>
        <div style={{ display: 'flex', gap: 10, overflow: 'hidden' }}>
          {[
            { c: T.fading, label: 'Fading', topic: 'Fractions', sub: '8d ago' },
            {
              c: T.good,
              label: 'Strong',
              topic: 'Order of ops',
              sub: 'last wk',
            },
            { c: T.weak, label: 'Stuck', topic: 'Word problems', sub: 'twice' },
          ].map((m, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                background: T.surface,
                borderRadius: 12,
                padding: '10px 12px',
                borderTop: `3px solid ${m.c}`,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  color: m.c,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: 0.4,
                }}
              >
                {m.label}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 3 }}>
                {m.topic}
              </div>
              <div style={{ fontSize: 11, color: T.textMute, marginTop: 1 }}>
                {m.sub}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Secondary actions — small, equal, low-stakes */}
      <div style={{ padding: '14px 22px 8px', display: 'flex', gap: 8 }}>
        {[
          { i: '📷', t: 'Homework' },
          { i: '💬', t: 'Ask' },
          { i: '🎮', t: 'Practice' },
        ].map((a, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              background: T.surface,
              borderRadius: 14,
              padding: '14px 8px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <div style={{ fontSize: 20 }}>{a.i}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.textSec }}>
              {a.t}
            </div>
          </div>
        ))}
      </div>

      <div style={{ flex: 1 }} />

      {/* Bottom nav */}
      <div
        style={{
          height: 60,
          background: 'rgba(34,34,74,0.9)',
          borderTop: `1px solid ${T.line}`,
          display: 'flex',
          justifyContent: 'space-around',
          alignItems: 'center',
          flexShrink: 0,
          backdropFilter: 'blur(8px)',
        }}
      >
        {['Home', 'Library', 'Progress', 'More'].map((l, i) => (
          <div
            key={l}
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: i === 0 ? T.primary : T.textMute,
            }}
          >
            {l}
          </div>
        ))}
      </div>
    </Screen>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// HOME — HYBRID
// Greeting + (conditional) coach band + subject shelf + actions + search.
// Driven by real fields: useSubjects(), recoveryMarker / resumeTarget /
// reviewSummary precedence, getTopicRetention() palette.
// ═══════════════════════════════════════════════════════════════════════════
// HOME — HYBRID (Direction D, revised)
// Greeting + conditional coach band + horizontal subject carousel (big cards
// with icon tile, subject name, continuation hint, progress bar) +
// ask-anything composer + 3 action buttons.
// ═══════════════════════════════════════════════════════════════════════════
function HomeHybrid() {
  const subjects = [
    {
      name: 'Algebra',
      icon: '📐',
      tint: 'rgba(45,212,191,0.18)',
      iconColor: T.primary,
      hint: 'Continue Linear equations',
      progress: 0.55,
      bar: T.primary,
    },
    {
      name: 'Biology',
      icon: '🧬',
      tint: 'rgba(167,139,250,0.18)',
      iconColor: T.accent,
      hint: 'Quiz: Photosynthesis',
      progress: 0.4,
      bar: T.accent,
    },
    {
      name: 'Spanish',
      icon: '🗣',
      tint: 'rgba(234,179,8,0.18)',
      iconColor: T.fading,
      hint: 'Practice: Past tense',
      progress: 0.25,
      bar: T.fading,
    },
  ];

  const SubjectCard = ({ s }) => (
    <div
      style={{
        flex: '0 0 142px',
        background: T.surface,
        borderRadius: 18,
        padding: '14px 14px 16px',
        border: `1px solid ${T.line}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        width: '100px',
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          background: s.tint,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 20,
        }}
      >
        {s.icon}
      </div>
      <div>
        <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.2 }}>
          {s.name}
        </div>
        <div
          style={{
            fontSize: 12,
            color: T.textSec,
            marginTop: 4,
            lineHeight: 1.3,
          }}
        >
          {s.hint}
        </div>
      </div>
      <div
        style={{
          height: 6,
          borderRadius: 3,
          background: T.surfaceElev,
          overflow: 'hidden',
          marginTop: 'auto',
        }}
      >
        <div
          style={{
            width: `${s.progress * 100}%`,
            height: '100%',
            background: s.bar,
          }}
        />
      </div>
    </div>
  );

  return (
    <Screen bg={T.bgDeep}>
      <StatusBar dark />

      {/* Greeting */}
      <div
        style={{
          padding: '6px 22px 8px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>
            Hey Sam!
          </div>
          <div style={{ fontSize: 13, color: T.textSec, marginTop: 1 }}>
            Tuesday evening
          </div>
        </div>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            background: T.surfaceElev,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            fontWeight: 700,
            border: `1.5px solid ${T.primary}`,
          }}
        >
          S
        </div>
      </div>

      {/* Coach band — conditional, dismissible */}
      <div style={{ padding: '6px 18px 12px' }}>
        <div
          style={{
            background:
              'linear-gradient(135deg, rgba(45,212,191,0.20), rgba(167,139,250,0.10))',
            border: '1px solid rgba(45,212,191,0.25)',
            borderRadius: 18,
            padding: '14px 16px',
            position: 'relative',
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: T.primary,
              fontWeight: 700,
              letterSpacing: 0.5,
              textTransform: 'uppercase',
            }}
          >
            💡 Tonight
          </div>
          <div
            style={{
              fontSize: 17,
              fontWeight: 700,
              marginTop: 5,
              lineHeight: 1.3,
            }}
          >
            Revisit <span style={{ color: T.primary }}>linear equations</span> —
            you were close on Thursday.
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginTop: 12,
            }}
          >
            <div
              style={{
                background: T.primary,
                color: T.bg,
                borderRadius: 12,
                padding: '11px 18px',
                fontSize: 14,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              Continue <span>›</span>
            </div>
            <div style={{ fontSize: 11, color: T.textMute }}>4 min</div>
          </div>
          <div
            style={{
              position: 'absolute',
              top: 8,
              right: 10,
              color: T.textMute,
              fontSize: 16,
              lineHeight: 1,
              padding: 4,
            }}
          >
            ×
          </div>
        </div>
      </div>

      {/* Subjects — horizontal carousel of bigger cards */}
      <div>
        <div
          style={{
            padding: '0 22px',
            fontSize: 11,
            color: T.textMute,
            fontWeight: 700,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
            marginBottom: 10,
          }}
        >
          Pick up where you left off
        </div>
        <div
          style={{
            display: 'flex',
            gap: 10,
            padding: '2px 18px 12px',
            overflowX: 'auto',
          }}
        >
          {subjects.map((s) => (
            <SubjectCard key={s.name} s={s} />
          ))}
          <div
            style={{
              flex: '0 0 96px',
              borderRadius: 18,
              padding: 14,
              border: `1.5px dashed ${T.line}`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: T.textMute,
              fontSize: 12,
              fontWeight: 600,
              gap: 8,
            }}
          >
            <div style={{ fontSize: 22, opacity: 0.7 }}>＋</div>
            New subject
          </div>
        </div>
      </div>

      {/* Ask anything — composer, NOT a button */}
      <div style={{ padding: '4px 18px 6px' }}>
        <div
          style={{
            background: T.surface,
            border: `1px solid ${T.line}`,
            borderRadius: 16,
            padding: '10px 12px 10px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <div style={{ fontSize: 14 }}>💬</div>
          <div style={{ flex: 1, fontSize: 13, color: T.textMute }}>
            Ask anything…
          </div>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              background: T.surfaceElev,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
            }}
          >
            🎤
          </div>
        </div>
      </div>

      {/* Three action buttons */}
      <div style={{ padding: '6px 18px 12px', display: 'flex', gap: 8 }}>
        {[
          { i: '📖', t: 'Study new' },
          { i: '📷', t: 'Homework' },
          { i: '🎮', t: 'Practice' },
        ].map((a) => (
          <div
            key={a.t}
            style={{
              flex: 1,
              background: T.surface,
              borderRadius: 14,
              padding: '12px 6px',
              border: `1px solid ${T.line}`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <div style={{ fontSize: 20 }}>{a.i}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.textSec }}>
              {a.t}
            </div>
          </div>
        ))}
      </div>

      <div style={{ flex: 1 }} />

      <div
        style={{
          height: 60,
          background: 'rgba(34,34,74,0.9)',
          borderTop: `1px solid ${T.line}`,
          display: 'flex',
          justifyContent: 'space-around',
          alignItems: 'center',
          flexShrink: 0,
          backdropFilter: 'blur(8px)',
        }}
      >
        {['Home', 'Library', 'Progress', 'More'].map((l, i) => (
          <div
            key={l}
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: i === 0 ? T.primary : T.textMute,
            }}
          >
            {l}
          </div>
        ))}
      </div>
    </Screen>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SESSION — CURRENT
// ═══════════════════════════════════════════════════════════════════════════
function SessionCurrent() {
  return (
    <Screen>
      <StatusBar dark />
      <div
        style={{
          background: T.surface,
          borderBottom: `1px solid ${T.line}`,
          padding: '8px 16px 12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ color: T.primary, fontSize: 22 }}>‹</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>
              Linear equations
            </div>
            <div style={{ fontSize: 12, color: T.textSec }}>
              I'm here to help
            </div>
          </div>
          <div
            style={{
              fontSize: 12,
              color: T.textSec,
              padding: '4px 10px',
              background: T.surfaceElev,
              borderRadius: 12,
            }}
          >
            🔇 Voice
          </div>
        </div>
      </div>

      <div
        style={{
          flex: 1,
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            alignSelf: 'flex-start',
            maxWidth: '85%',
            background: T.surfaceElev,
            padding: '12px 14px',
            borderRadius: 16,
          }}
        >
          <div style={{ fontSize: 14 }}>
            Solve for x: 3x + 7 = 22. Walk me through your first step.
          </div>
        </div>
        <div
          style={{
            alignSelf: 'flex-end',
            maxWidth: '85%',
            background: T.primary,
            color: T.bg,
            padding: '12px 14px',
            borderRadius: 16,
          }}
        >
          <div style={{ fontSize: 14 }}>subtract 7 from both sides?</div>
        </div>
        <div
          style={{
            alignSelf: 'flex-start',
            maxWidth: '85%',
            background: T.surfaceElev,
            padding: '12px 14px',
            borderRadius: 16,
          }}
        >
          <div style={{ fontSize: 14 }}>
            Yes — and what does the equation look like after that move?
          </div>
        </div>
      </div>

      {/* Voice/Text toggle — eats vertical space */}
      <div
        style={{
          background: T.surface,
          borderTop: `1px solid ${T.line}`,
          padding: 8,
        }}
      >
        <div
          style={{
            background: T.surfaceElev,
            borderRadius: 999,
            padding: 4,
            display: 'flex',
          }}
        >
          <div
            style={{
              flex: 1,
              background: T.bg,
              borderRadius: 999,
              padding: '8px 0',
              textAlign: 'center',
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            Text mode
          </div>
          <div
            style={{
              flex: 1,
              padding: '8px 0',
              textAlign: 'center',
              fontSize: 13,
              color: T.textSec,
              fontWeight: 700,
            }}
          >
            Voice mode
          </div>
        </div>
      </div>
      <div
        style={{
          background: T.surface,
          padding: '8px 14px 18px',
          display: 'flex',
          gap: 8,
          alignItems: 'center',
        }}
      >
        <div
          style={{
            flex: 1,
            background: T.bg,
            borderRadius: 10,
            padding: '12px 14px',
            fontSize: 13,
            color: T.textMute,
          }}
        >
          Type a message...
        </div>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: T.surfaceElev,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: T.textMute,
          }}
        >
          ➤
        </div>
      </div>
    </Screen>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SESSION — IMPROVED
// Show: where we are in the loop, what the coach knows, question budget.
// Combine voice/text into a single mic-in-input affordance.
// ═══════════════════════════════════════════════════════════════════════════
function SessionImproved() {
  return (
    <Screen bg={T.bgDeep}>
      <StatusBar dark />

      {/* Slim header — topic + escalation rung indicator */}
      <div style={{ padding: '6px 18px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ color: T.text, fontSize: 22, opacity: 0.6 }}>‹</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>
              Linear equations
            </div>
            <div
              style={{
                display: 'flex',
                gap: 6,
                marginTop: 4,
                alignItems: 'center',
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  color: T.textMute,
                  fontFamily: MONO,
                  letterSpacing: 0.3,
                }}
              >
                RUNG 2 · BUILDING
              </span>
              <span
                style={{
                  width: 3,
                  height: 3,
                  borderRadius: 2,
                  background: T.textMute,
                }}
              />
              <span
                style={{ fontSize: 10, color: T.textMute, letterSpacing: 0.3 }}
              >
                2 of 4 exchanges
              </span>
            </div>
          </div>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              background: T.surface,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
            }}
          >
            ⋯
          </div>
        </div>
      </div>

      {/* Memory chip — surfaces continuity ("I remember…") */}
      <div style={{ padding: '0 18px 8px' }}>
        <div
          style={{
            background: T.surface,
            borderRadius: 12,
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12,
          }}
        >
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              background: T.accent,
            }}
          />
          <span style={{ color: T.textSec }}>
            Last week you mixed up the sign — I'll watch for that.
          </span>
        </div>
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          padding: '8px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          overflow: 'hidden',
        }}
      >
        <div style={{ alignSelf: 'flex-start', maxWidth: '88%' }}>
          <div
            style={{
              background: T.surface,
              padding: '12px 14px',
              borderRadius: 16,
              borderTopLeftRadius: 4,
            }}
          >
            <div style={{ fontSize: 14, lineHeight: 1.45 }}>
              Solve for x:{' '}
              <span
                style={{
                  fontFamily: MONO,
                  background: T.bgDeep,
                  padding: '1px 6px',
                  borderRadius: 4,
                }}
              >
                3x + 7 = 22
              </span>
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.45, marginTop: 6 }}>
              Walk me through your first step.
            </div>
          </div>
        </div>
        <div style={{ alignSelf: 'flex-end', maxWidth: '88%' }}>
          <div
            style={{
              background: T.primary,
              color: T.bg,
              padding: '12px 14px',
              borderRadius: 16,
              borderTopRightRadius: 4,
            }}
          >
            <div style={{ fontSize: 14 }}>subtract 7 from both sides</div>
          </div>
        </div>
        <div style={{ alignSelf: 'flex-start', maxWidth: '88%' }}>
          <div
            style={{
              background: T.surface,
              padding: '12px 14px',
              borderRadius: 16,
              borderTopLeftRadius: 4,
            }}
          >
            <div style={{ fontSize: 14, lineHeight: 1.45 }}>
              Yes 👍 What does it look like now?
            </div>
          </div>
          {/* Verification badge — surfaces the structured-envelope signal */}
          <div
            style={{
              display: 'flex',
              gap: 6,
              marginTop: 4,
              alignItems: 'center',
            }}
          >
            <span
              style={{
                fontSize: 10,
                color: T.good,
                fontWeight: 700,
                letterSpacing: 0.3,
              }}
            >
              ✓ TEACH-BACK CLEARED
            </span>
          </div>
        </div>
      </div>

      {/* Combined composer — mic lives inside the input, no separate toggle row */}
      <div
        style={{
          padding: '8px 14px 14px',
          background: 'rgba(15,15,38,0.85)',
          backdropFilter: 'blur(12px)',
          borderTop: `1px solid ${T.line}`,
        }}
      >
        <div
          style={{
            background: T.surface,
            borderRadius: 24,
            padding: '6px 6px 6px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            border: `1px solid ${T.line}`,
          }}
        >
          <div
            style={{
              flex: 1,
              fontSize: 14,
              color: T.textMute,
              padding: '8px 0',
            }}
          >
            Tell me your next step…
          </div>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              background: T.surfaceElev,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
            }}
          >
            🎤
          </div>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              background: T.primary,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: T.bg,
              fontSize: 14,
            }}
          >
            ➤
          </div>
        </div>
      </div>
    </Screen>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PARENT DASHBOARD — CURRENT
// ═══════════════════════════════════════════════════════════════════════════
function DashboardCurrent() {
  return (
    <Screen>
      <StatusBar dark />
      <div style={{ padding: '14px 20px 8px' }}>
        <div style={{ color: T.accent, fontSize: 14, marginBottom: 6 }}>
          ← Back
        </div>
        <div style={{ fontSize: 24, fontWeight: 700 }}>Child progress</div>
        <div style={{ fontSize: 13, color: T.textSec, marginTop: 2 }}>
          How your children are doing
        </div>
      </div>
      <div
        style={{
          flex: 1,
          padding: 16,
          gap: 16,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {['Maya', 'Theo'].map((name, i) => (
          <div
            key={name}
            style={{ background: T.surface, borderRadius: 16, padding: 18 }}
          >
            <div style={{ fontSize: 18, fontWeight: 700 }}>{name}</div>
            <div
              style={{
                fontSize: 13,
                color: T.textSec,
                marginTop: 6,
                lineHeight: 1.5,
              }}
            >
              {i === 0
                ? "Maya practiced 42 minutes this week, up from 28 last week. She's making steady progress in algebra."
                : 'Theo had 3 sessions this week, focused mainly on biology vocabulary.'}
            </div>
            <div
              style={{
                display: 'flex',
                gap: 8,
                marginTop: 12,
                flexWrap: 'wrap',
              }}
            >
              <div
                style={{
                  background: T.surfaceElev,
                  padding: '4px 10px',
                  borderRadius: 12,
                  fontSize: 12,
                }}
              >
                📈 Up
              </div>
              <div
                style={{
                  background: T.surfaceElev,
                  padding: '4px 10px',
                  borderRadius: 12,
                  fontSize: 12,
                }}
              >
                {i === 0 ? '5 sessions' : '3 sessions'}
              </div>
            </div>
            <div
              style={{
                background: T.primary,
                color: T.bg,
                padding: '10px 0',
                borderRadius: 10,
                textAlign: 'center',
                fontSize: 14,
                fontWeight: 700,
                marginTop: 14,
              }}
            >
              See details
            </div>
          </div>
        ))}
      </div>
    </Screen>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PARENT DASHBOARD — IMPROVED
// Lead with the answer. Numbers > paragraphs. Retention as the visual spine.
// ═══════════════════════════════════════════════════════════════════════════
function DashboardImproved() {
  return (
    <Screen bg={T.bgDeep}>
      <StatusBar dark />
      <div
        style={{
          padding: '8px 22px 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ color: T.textMute, fontSize: 14 }}>‹ Home</div>
        <div
          style={{
            fontSize: 12,
            color: T.textMute,
            letterSpacing: 0.4,
            textTransform: 'uppercase',
            fontWeight: 600,
          }}
        >
          This week
        </div>
      </div>

      {/* Headline answer — what every parent wants to know */}
      <div style={{ padding: '12px 22px 14px' }}>
        <div
          style={{
            fontSize: 13,
            color: T.textMute,
            fontWeight: 600,
            letterSpacing: 0.3,
          }}
        >
          BOTH KIDS
        </div>
        <div
          style={{
            fontSize: 28,
            fontWeight: 700,
            marginTop: 4,
            lineHeight: 1.15,
          }}
        >
          <span style={{ color: T.good }}>72 min</span> learned,{' '}
          <span style={{ color: T.good }}>9 topics</span> stuck.
        </div>
        <div style={{ fontSize: 13, color: T.textSec, marginTop: 6 }}>
          Up 18 min from last week. Maya's leading.
        </div>
      </div>

      {/* Per-child cards — retention-band as the visual spine */}
      <div
        style={{
          flex: 1,
          padding: '0 22px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          overflow: 'hidden',
        }}
      >
        {[
          {
            name: 'Maya',
            age: 13,
            mins: 42,
            dMins: '+14',
            strong: 6,
            fading: 2,
            weak: 1,
            last: 'Tue evening',
            subj: 'Algebra · Biology',
          },
          {
            name: 'Theo',
            age: 11,
            mins: 30,
            dMins: '+4',
            strong: 3,
            fading: 1,
            weak: 0,
            last: 'Yesterday',
            subj: 'Biology · Spanish',
          },
        ].map((c) => {
          const total = c.strong + c.fading + c.weak;
          return (
            <div
              key={c.name}
              style={{
                background: T.surface,
                borderRadius: 18,
                padding: 16,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    background: T.surfaceHi,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 15,
                    fontWeight: 700,
                  }}
                >
                  {c.name[0]}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>
                    {c.name}, {c.age}
                  </div>
                  <div style={{ fontSize: 12, color: T.textMute }}>
                    {c.subj} · last seen {c.last.toLowerCase()}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: T.text }}>
                    {c.mins}
                    <span
                      style={{
                        fontSize: 11,
                        color: T.textMute,
                        fontWeight: 600,
                      }}
                    >
                      m
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: T.good, fontWeight: 700 }}>
                    {c.dMins} vs last wk
                  </div>
                </div>
              </div>

              {/* Retention bar — the answer at a glance */}
              <div
                style={{
                  marginTop: 14,
                  display: 'flex',
                  height: 8,
                  borderRadius: 4,
                  overflow: 'hidden',
                  background: T.surfaceElev,
                }}
              >
                <div style={{ flex: c.strong, background: T.good }} />
                <div style={{ flex: c.fading, background: T.fading }} />
                <div style={{ flex: c.weak, background: T.weak }} />
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginTop: 8,
                  fontSize: 11,
                  color: T.textSec,
                }}
              >
                <span>
                  <span style={{ color: T.good, fontWeight: 700 }}>●</span>{' '}
                  {c.strong} strong
                </span>
                <span>
                  <span style={{ color: T.fading, fontWeight: 700 }}>●</span>{' '}
                  {c.fading} fading
                </span>
                <span>
                  <span style={{ color: T.weak, fontWeight: 700 }}>●</span>{' '}
                  {c.weak} stuck
                </span>
                <span style={{ color: T.textMute }}>{total} total</span>
              </div>

              {/* Action — only when there's something parent should do */}
              {c.weak > 0 && (
                <div
                  style={{
                    marginTop: 12,
                    padding: '10px 12px',
                    background: 'rgba(249,115,22,0.1)',
                    borderRadius: 10,
                    fontSize: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>
                    <span style={{ color: T.weak, fontWeight: 700 }}>
                      {c.weak} topic stuck.
                    </span>{' '}
                    <span style={{ color: T.textSec }}>Word problems.</span>
                  </span>
                  <span style={{ color: T.weak, fontWeight: 700 }}>Open ›</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Screen>
  );
}

// ─── Annotation panel ─────────────────────────────────────────────────────
function Notes({ items }) {
  return (
    <div
      style={{
        width: 360,
        padding: 24,
        fontFamily: FONT,
        color: '#1a1a2e',
        background: '#fff',
        borderRadius: 12,
        border: '1px solid #e2e2ea',
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: '#6e6e92',
          textTransform: 'uppercase',
          letterSpacing: 0.6,
          fontWeight: 700,
          marginBottom: 10,
        }}
      >
        What changed
      </div>
      <ul
        style={{
          margin: 0,
          padding: 0,
          listStyle: 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        {items.map((it, i) => (
          <li key={i} style={{ fontSize: 13, lineHeight: 1.5 }}>
            <div style={{ fontWeight: 700, color: '#16162e' }}>{it.title}</div>
            <div style={{ color: '#4a4a6a', marginTop: 2 }}>{it.body}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

window.HomeCurrent = HomeCurrent;
window.HomeImproved = HomeImproved;
window.HomeHybrid = HomeHybrid;
window.SessionCurrent = SessionCurrent;
window.SessionImproved = SessionImproved;
window.DashboardCurrent = DashboardCurrent;
window.DashboardImproved = DashboardImproved;
window.Notes = Notes;
