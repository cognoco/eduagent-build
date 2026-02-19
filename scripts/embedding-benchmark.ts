#!/usr/bin/env tsx
// ---------------------------------------------------------------------------
// Embedding Provider Benchmark — OpenAI vs Voyage AI
// Compares retrieval quality on representative EduAgent tutoring content.
//
// Usage:
//   OPENAI_API_KEY=sk-... VOYAGE_API_KEY=pa-... pnpm exec tsx scripts/embedding-benchmark.ts
//
// Cost: ~$0.05-0.10 total (both providers combined)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ContentChunk {
  id: string;
  subject: string;
  topic: string;
  content: string;
  /** Tags for subset analysis */
  tags: Array<'math' | 'stem' | 'humanities' | 'notation' | 'conceptual'>;
}

interface TestQuery {
  id: string;
  query: string;
  /** IDs of chunks that are considered correct matches (ground truth) */
  expectedChunkIds: string[];
  tags: Array<
    'direct' | 'paraphrase' | 'cross-topic' | 'notation' | 'conceptual'
  >;
}

interface EmbeddingResponse {
  vector: number[];
  model: string;
  tokensUsed: number;
}

interface BenchmarkResult {
  provider: string;
  model: string;
  totalQueries: number;
  recall1: number;
  recall3: number;
  recall5: number;
  mrr: number;
  avgLatencyMs: number;
  totalTokens: number;
  /** Per-tag breakdown */
  tagBreakdown: Record<string, { recall5: number; mrr: number; count: number }>;
  /** Per-query details */
  queryDetails: Array<{
    queryId: string;
    query: string;
    topMatches: Array<{ chunkId: string; score: number; topic: string }>;
    correctInTop5: boolean;
    reciprocalRank: number;
  }>;
}

// ---------------------------------------------------------------------------
// Representative tutoring content chunks
//
// These simulate real `extractSessionContent()` output: concatenated
// user_message + ai_response from EduAgent learning sessions.
// ---------------------------------------------------------------------------

const CONTENT_CHUNKS: ContentChunk[] = [
  // ─── MATH: Algebra ─────────────────────────────────────────────────
  {
    id: 'math-quadratic-formula',
    subject: 'Mathematics',
    topic: 'Quadratic Formula',
    tags: ['math', 'stem', 'notation'],
    content: `What is the quadratic formula?

The quadratic formula solves any equation of the form ax² + bx + c = 0. The formula is:

x = (-b ± √(b² - 4ac)) / 2a

The part under the square root, b² - 4ac, is called the discriminant. If it's positive, you get two real solutions. If it's zero, one solution. If it's negative, the solutions are complex numbers.

Can you tell me what happens when the discriminant equals zero?

When b² - 4ac = 0, there's exactly one real solution because both the plus and minus give the same answer.

Exactly! That's called a repeated root or double root.`,
  },
  {
    id: 'math-completing-square',
    subject: 'Mathematics',
    topic: 'Completing the Square',
    tags: ['math', 'stem', 'notation'],
    content: `How do I complete the square?

Completing the square transforms ax² + bx + c into a(x - h)² + k form. Here's the process:

1. Start with x² + 6x + 2
2. Take half of the coefficient of x: 6/2 = 3
3. Square it: 3² = 9
4. Add and subtract 9: x² + 6x + 9 - 9 + 2
5. Factor the perfect square: (x + 3)² - 7

So x² + 6x + 2 = (x + 3)² - 7. The vertex of this parabola is at (-3, -7).

Why do we add and subtract the same number?

Great question! We're effectively adding zero — the expression doesn't change in value. We're just rewriting it in a form that reveals the vertex.`,
  },
  {
    id: 'math-factoring',
    subject: 'Mathematics',
    topic: 'Factoring Polynomials',
    tags: ['math', 'stem', 'notation'],
    content: `How do I factor x² + 5x + 6?

To factor a quadratic x² + bx + c, we need two numbers that multiply to c and add to b.

For x² + 5x + 6:
- We need two numbers that multiply to 6 and add to 5
- Those numbers are 2 and 3
- So x² + 5x + 6 = (x + 2)(x + 3)

Let's verify: (x + 2)(x + 3) = x² + 3x + 2x + 6 = x² + 5x + 6 ✓

What about x² - x - 6?

Now we need numbers that multiply to -6 and add to -1. That's -3 and 2.
So x² - x - 6 = (x - 3)(x + 2).`,
  },
  {
    id: 'math-linear-equations',
    subject: 'Mathematics',
    topic: 'Linear Equations',
    tags: ['math', 'stem'],
    content: `How do I solve 3x + 7 = 22?

To solve a linear equation, isolate the variable x step by step:

1. Subtract 7 from both sides: 3x = 15
2. Divide both sides by 3: x = 5

Let's check: 3(5) + 7 = 15 + 7 = 22 ✓

What if there are variables on both sides, like 2x + 3 = x + 8?

Move all x terms to one side: 2x - x = 8 - 3, so x = 5. The key principle is: whatever you do to one side, do to the other.`,
  },
  {
    id: 'math-systems-of-equations',
    subject: 'Mathematics',
    topic: 'Systems of Equations',
    tags: ['math', 'stem', 'notation'],
    content: `How do I solve a system of two equations?

Given:
  2x + y = 10
  x - y = 2

Method 1 (Elimination): Add both equations to eliminate y:
  2x + y + x - y = 10 + 2
  3x = 12
  x = 4
  Substitute back: 4 - y = 2, so y = 2

Method 2 (Substitution): From equation 2, x = y + 2. Substitute into equation 1:
  2(y + 2) + y = 10
  3y + 4 = 10
  y = 2, x = 4

When would I use one method over the other?

Elimination works best when coefficients line up nicely. Substitution is easier when one variable is already isolated.`,
  },
  {
    id: 'math-inequalities',
    subject: 'Mathematics',
    topic: 'Inequalities',
    tags: ['math', 'stem', 'notation'],
    content: `How do inequalities work?

Inequalities follow the same rules as equations with one critical exception: when you multiply or divide by a negative number, you flip the inequality sign.

Example: Solve -2x + 3 > 7
  -2x > 4
  x < -2 (sign flipped because we divided by -2)

The solution set is all numbers less than -2. On a number line, we draw an open circle at -2 and shade to the left.

Why does the sign flip?

Think about it with numbers: 2 < 5 is true. Multiply both by -1: -2 > -5. The larger positive number becomes the smaller negative number!`,
  },
  {
    id: 'math-exponents',
    subject: 'Mathematics',
    topic: 'Exponent Rules',
    tags: ['math', 'stem', 'notation'],
    content: `What are the exponent rules?

The key rules:
- Product rule: x^a · x^b = x^(a+b)
- Quotient rule: x^a / x^b = x^(a-b)
- Power rule: (x^a)^b = x^(ab)
- Zero exponent: x^0 = 1 (when x ≠ 0)
- Negative exponent: x^(-a) = 1/x^a

Example: Simplify (2x³)² · x^(-2)
= 4x^6 · x^(-2)
= 4x^4

Why does x^0 = 1?

Consider the pattern: x³ = x·x·x, x² = x·x, x¹ = x. Each time we divide by x. So x^0 = x¹/x = 1.`,
  },
  {
    id: 'math-logarithms',
    subject: 'Mathematics',
    topic: 'Logarithms',
    tags: ['math', 'stem', 'notation'],
    content: `What is a logarithm?

A logarithm answers: "What exponent gives me this number?"

log_b(x) = y means b^y = x

Examples:
- log₂(8) = 3 because 2³ = 8
- log₁₀(1000) = 3 because 10³ = 1000
- ln(e²) = 2 because e² = e²

Key properties:
- log(ab) = log(a) + log(b)
- log(a/b) = log(a) - log(b)
- log(a^n) = n·log(a)

How do I solve log₂(x) = 5?

Convert to exponential form: 2⁵ = x, so x = 32. The logarithm and exponential are inverse operations!`,
  },

  // ─── MATH: Geometry ────────────────────────────────────────────────
  {
    id: 'math-pythagorean',
    subject: 'Mathematics',
    topic: 'Pythagorean Theorem',
    tags: ['math', 'stem', 'notation'],
    content: `What is the Pythagorean theorem?

In a right triangle, a² + b² = c², where c is the hypotenuse (the side opposite the right angle).

Example: If one leg is 3 and another is 4, the hypotenuse is:
c² = 3² + 4² = 9 + 16 = 25
c = √25 = 5

This gives us the famous 3-4-5 right triangle. Other common Pythagorean triples are 5-12-13 and 8-15-17.

Does it work for any triangle?

No! Only right triangles. For other triangles, you'd use the law of cosines: c² = a² + b² - 2ab·cos(C).`,
  },
  {
    id: 'math-circle-area',
    subject: 'Mathematics',
    topic: 'Circle Area and Circumference',
    tags: ['math', 'stem', 'notation'],
    content: `How do I find the area and circumference of a circle?

Area = πr² (pi times radius squared)
Circumference = 2πr (or πd, where d is the diameter)

Example with radius = 7cm:
- Area = π(7²) = 49π ≈ 153.94 cm²
- Circumference = 2π(7) = 14π ≈ 43.98 cm

What's the difference between radius and diameter?

The diameter goes all the way across the circle through the center. The radius goes from the center to the edge — it's exactly half the diameter. So d = 2r.`,
  },
  {
    id: 'math-trig-basics',
    subject: 'Mathematics',
    topic: 'Basic Trigonometry',
    tags: ['math', 'stem', 'notation'],
    content: `What are sine, cosine, and tangent?

In a right triangle:
- sin(θ) = opposite / hypotenuse
- cos(θ) = adjacent / hypotenuse
- tan(θ) = opposite / adjacent

Remember: SOH-CAH-TOA

Example: In a right triangle with angle 30°:
- sin(30°) = 1/2
- cos(30°) = √3/2
- tan(30°) = 1/√3 = √3/3

How do I find an angle if I know two sides?

Use the inverse functions! If sin(θ) = 0.5, then θ = arcsin(0.5) = 30°. Your calculator's sin⁻¹ button does this.`,
  },

  // ─── SCIENCE: Physics ──────────────────────────────────────────────
  {
    id: 'physics-newtons-laws',
    subject: 'Physics',
    topic: "Newton's Laws of Motion",
    tags: ['stem', 'conceptual'],
    content: `What are Newton's three laws of motion?

First Law (Inertia): An object stays at rest or in uniform motion unless acted on by an external force. A book on a table stays there until you push it.

Second Law (F = ma): Force equals mass times acceleration. A heavier shopping cart needs more force to accelerate at the same rate.

Third Law (Action-Reaction): Every action has an equal and opposite reaction. When you push against a wall, the wall pushes back on you with equal force.

Why don't action and reaction cancel out?

They act on DIFFERENT objects! When you push a wall, you push on the wall and the wall pushes on you. They don't cancel because they're on different objects.`,
  },
  {
    id: 'physics-energy',
    subject: 'Physics',
    topic: 'Energy Conservation',
    tags: ['stem', 'notation', 'conceptual'],
    content: `What is conservation of energy?

Energy cannot be created or destroyed, only transformed. The total energy in a closed system remains constant.

Types of mechanical energy:
- Kinetic energy: KE = ½mv² (energy of motion)
- Potential energy: PE = mgh (energy of position, where g ≈ 9.8 m/s²)

Example: A 2kg ball dropped from 10m height:
- At top: PE = 2(9.8)(10) = 196 J, KE = 0
- At bottom: PE = 0, KE = 196 J
- Speed at bottom: ½(2)v² = 196, v = √196 = 14 m/s

Where does the energy go when the ball stops bouncing?

It converts to thermal energy (heat) and sound. Energy isn't lost — it transforms into forms we can't easily recover.`,
  },
  {
    id: 'physics-electricity',
    subject: 'Physics',
    topic: "Ohm's Law and Circuits",
    tags: ['stem', 'notation'],
    content: `What is Ohm's law?

V = IR, where:
- V = voltage (volts) — the "push" driving electrons
- I = current (amps) — flow rate of electrons
- R = resistance (ohms) — opposition to flow

Think of it like water: voltage is water pressure, current is flow rate, resistance is pipe narrowness.

Example: A 12V battery with a 4Ω resistor:
I = V/R = 12/4 = 3 amps

In series circuits, resistances add: R_total = R₁ + R₂
In parallel circuits: 1/R_total = 1/R₁ + 1/R₂

Why do Christmas lights in series all go out when one breaks?

In series, current follows one path. A broken bulb breaks the circuit entirely. Parallel circuits have multiple paths, so one failure doesn't stop the rest.`,
  },
  {
    id: 'physics-waves',
    subject: 'Physics',
    topic: 'Waves and Sound',
    tags: ['stem', 'conceptual'],
    content: `How do waves work?

Waves transfer energy without transferring matter. Key properties:
- Wavelength (λ): distance between crests
- Frequency (f): number of crests per second (Hertz)
- Amplitude: height of the wave (relates to loudness/brightness)
- Speed: v = λ × f

Sound waves are longitudinal — particles vibrate back and forth in the direction of travel. They need a medium (air, water, solid).

Light waves are transverse and can travel through a vacuum.

Why is thunder heard after lightning?

Light travels at 300,000 km/s while sound travels at only 343 m/s. You see the lightning almost instantly but sound takes about 3 seconds per kilometer.`,
  },
  {
    id: 'physics-gravity',
    subject: 'Physics',
    topic: 'Gravity and Free Fall',
    tags: ['stem', 'notation'],
    content: `How does gravity work near Earth's surface?

All objects near Earth experience gravitational acceleration g ≈ 9.8 m/s² downward, regardless of mass.

Free fall equations:
- v = v₀ + gt
- d = v₀t + ½gt²
- v² = v₀² + 2gd

Example: Drop a ball from a 45m building (v₀ = 0):
- Time to fall: 45 = ½(9.8)t², t = √(90/9.8) ≈ 3.03 s
- Speed at impact: v = 9.8(3.03) ≈ 29.7 m/s

Wait, doesn't a feather fall slower than a bowling ball?

In air, yes — because of air resistance! In a vacuum, they fall at exactly the same rate. Apollo 15 astronaut David Scott demonstrated this on the Moon.`,
  },

  // ─── SCIENCE: Chemistry ────────────────────────────────────────────
  {
    id: 'chem-periodic-table',
    subject: 'Chemistry',
    topic: 'Periodic Table Organization',
    tags: ['stem', 'conceptual'],
    content: `How is the periodic table organized?

Elements are arranged by increasing atomic number (protons). The structure reveals patterns:

- Rows (periods): Elements in the same period have the same number of electron shells
- Columns (groups): Elements in the same group have similar chemical properties
- Group 1 (alkali metals): Very reactive, one valence electron (Li, Na, K...)
- Group 17 (halogens): Reactive nonmetals, seven valence electrons (F, Cl, Br...)
- Group 18 (noble gases): Stable, full outer shell (He, Ne, Ar...)

Why are noble gases so stable?

They have a complete outer electron shell — 8 electrons (or 2 for helium). This is the "octet rule." Other elements react to try to achieve this stable configuration.`,
  },
  {
    id: 'chem-balancing',
    subject: 'Chemistry',
    topic: 'Balancing Chemical Equations',
    tags: ['stem', 'notation'],
    content: `How do I balance chemical equations?

The law of conservation of mass means atoms in = atoms out.

Unbalanced: Fe + O₂ → Fe₂O₃
Count atoms: Fe(1→2), O(2→3) — not balanced!

Step by step:
1. Start with the most complex molecule: Fe₂O₃ has 2 Fe and 3 O
2. Balance Fe: 2Fe + O₂ → Fe₂O₃
3. Balance O: need 3 O atoms, but O₂ comes in pairs
4. Use 3/2: 2Fe + 3/2 O₂ → Fe₂O₃
5. Clear fractions (×2): 4Fe + 3O₂ → 2Fe₂O₃

Check: Fe(4=4) ✓, O(6=6) ✓

Why can't I just change the subscripts?

Changing subscripts changes the substance! H₂O (water) is completely different from H₂O₂ (hydrogen peroxide). Coefficients change amounts, subscripts change identity.`,
  },
  {
    id: 'chem-moles',
    subject: 'Chemistry',
    topic: 'The Mole Concept',
    tags: ['stem', 'notation'],
    content: `What is a mole in chemistry?

A mole is 6.022 × 10²³ particles (Avogadro's number). It bridges the atomic and macroscopic worlds.

Key relationships:
- 1 mol of any element = its atomic mass in grams
- 1 mol of C-12 = 12 grams
- 1 mol of H₂O = 18 grams (2×1 + 16)
- 1 mol of any gas at STP = 22.4 liters

Molar mass calculation for glucose (C₆H₁₂O₆):
= 6(12) + 12(1) + 6(16)
= 72 + 12 + 96
= 180 g/mol

If I have 90 grams of glucose, how many moles?

Moles = mass / molar mass = 90/180 = 0.5 mol. That's about 3.01 × 10²³ molecules!`,
  },
  {
    id: 'chem-acids-bases',
    subject: 'Chemistry',
    topic: 'Acids and Bases',
    tags: ['stem', 'notation'],
    content: `What makes something an acid or a base?

Acids donate H⁺ ions (protons). Bases accept H⁺ ions or donate OH⁻.

pH scale: 0-14
- pH < 7: acidic (lemon juice ≈ 2, stomach acid ≈ 1.5)
- pH = 7: neutral (pure water)
- pH > 7: basic (soap ≈ 9, bleach ≈ 12)

pH = -log₁₀[H⁺]

Neutralization: acid + base → salt + water
HCl + NaOH → NaCl + H₂O

Each pH unit represents a 10× change. pH 3 is 10 times more acidic than pH 4 and 100 times more acidic than pH 5.

Is coffee acidic or basic?

Coffee has a pH of about 5, so it's mildly acidic. That's why it can irritate sensitive stomachs!`,
  },

  // ─── SCIENCE: Biology ──────────────────────────────────────────────
  {
    id: 'bio-photosynthesis',
    subject: 'Biology',
    topic: 'Photosynthesis',
    tags: ['stem', 'notation', 'conceptual'],
    content: `How does photosynthesis work?

Photosynthesis converts light energy into chemical energy stored in glucose:

6CO₂ + 6H₂O + light energy → C₆H₁₂O₆ + 6O₂

It occurs in two stages:
1. Light reactions (in thylakoids): Water is split, producing O₂, ATP, and NADPH
2. Calvin cycle (in stroma): CO₂ is fixed into glucose using ATP and NADPH

Chlorophyll in chloroplasts absorbs mainly red and blue light, reflecting green — which is why plants look green.

Why do plants need CO₂ and we need O₂?

Plants and animals are complementary! Plants take in CO₂ and release O₂ through photosynthesis. Animals take in O₂ and release CO₂ through cellular respiration. It's a cycle.`,
  },
  {
    id: 'bio-cell-respiration',
    subject: 'Biology',
    topic: 'Cellular Respiration',
    tags: ['stem', 'notation', 'conceptual'],
    content: `What is cellular respiration?

Cellular respiration is essentially photosynthesis in reverse — it breaks down glucose to release energy:

C₆H₁₂O₆ + 6O₂ → 6CO₂ + 6H₂O + ATP (energy)

Three stages:
1. Glycolysis (cytoplasm): Glucose → 2 pyruvate. Produces 2 ATP
2. Krebs cycle (mitochondrial matrix): Pyruvate → CO₂. Produces 2 ATP
3. Electron transport chain (inner membrane): Produces ~34 ATP

Total yield: ~38 ATP per glucose molecule

How is this different from just burning sugar?

Both produce the same products, but burning releases all energy as heat at once. Cellular respiration releases energy gradually through controlled steps, capturing it in ATP for the cell to use.`,
  },
  {
    id: 'bio-dna',
    subject: 'Biology',
    topic: 'DNA Structure and Replication',
    tags: ['stem', 'conceptual'],
    content: `What is the structure of DNA?

DNA is a double helix made of two strands of nucleotides. Each nucleotide has:
- A sugar (deoxyribose)
- A phosphate group
- A nitrogenous base: Adenine (A), Thymine (T), Guanine (G), or Cytosine (C)

Base pairing rules: A pairs with T, G pairs with C (complementary base pairing)

If one strand reads ATCGGA, the complementary strand reads TAGCCT.

During replication, the helix unzips and each strand serves as a template. DNA polymerase adds matching nucleotides to build new complementary strands.

Why does A always pair with T?

It's about hydrogen bonds and molecular shape. A-T form 2 hydrogen bonds, G-C form 3. The shapes fit together like puzzle pieces — A physically can't bond properly with C or G.`,
  },
  {
    id: 'bio-evolution',
    subject: 'Biology',
    topic: 'Natural Selection',
    tags: ['stem', 'conceptual'],
    content: `How does natural selection work?

Darwin's four conditions:
1. Variation: Individuals differ in traits
2. Inheritance: Traits are passed to offspring
3. Overproduction: More offspring are born than can survive
4. Differential survival: Individuals with advantageous traits survive and reproduce more

Example: In a population of beetles, green beetles are harder for birds to spot on leaves. Over generations, more green beetles survive to reproduce, and the population shifts toward green.

This is NOT "survival of the fittest" meaning strongest. Fitness means reproductive success — passing on genes. A perfectly camouflaged beetle that can't find a mate has zero fitness.

Is evolution random?

Mutations are random, but natural selection is NOT random. It consistently favors traits that improve survival and reproduction in a given environment.`,
  },
  {
    id: 'bio-genetics',
    subject: 'Biology',
    topic: 'Mendelian Genetics',
    tags: ['stem', 'notation'],
    content: `How do Punnett squares work?

Punnett squares predict offspring genotype ratios. Each parent contributes one allele.

Example: Cross Bb × Bb (both heterozygous for brown/blue eyes):

     B    b
B  | BB | Bb |
b  | Bb | bb |

Results: 1 BB : 2 Bb : 1 bb
Phenotype ratio: 3 brown : 1 blue (B is dominant)

Key terms:
- Genotype: genetic makeup (BB, Bb, bb)
- Phenotype: physical expression (brown or blue eyes)
- Homozygous: same alleles (BB or bb)
- Heterozygous: different alleles (Bb)

Can two brown-eyed parents have a blue-eyed child?

Yes! If both are Bb (carriers), there's a 25% chance of bb (blue-eyed) offspring. The blue allele was "hidden" by the dominant brown.`,
  },

  // ─── HUMANITIES: History ───────────────────────────────────────────
  {
    id: 'hist-wwi-causes',
    subject: 'History',
    topic: 'Causes of World War I',
    tags: ['humanities', 'conceptual'],
    content: `Why did World War I start?

Four underlying causes (MAIN):
- Militarism: Arms race, especially between Britain and Germany's navies
- Alliances: Two alliance systems (Triple Entente vs Triple Alliance) meant a local conflict could drag in everyone
- Imperialism: Competition for colonies created tensions
- Nationalism: Ethnic groups wanted self-determination, especially in the Balkans

The spark: Assassination of Archduke Franz Ferdinand of Austria-Hungary by Gavrilo Princip in Sarajevo, June 28, 1914.

Austria-Hungary blamed Serbia → Russia mobilized to protect Serbia → Germany declared war on Russia → France was allied with Russia → Germany invaded Belgium to reach France → Britain entered to defend Belgium.

Could WWI have been prevented?

Many historians argue yes — at multiple points, diplomats could have de-escalated. But the alliance system, combined with inflexible military timetables (especially Germany's Schlieffen Plan), created a chain reaction that was hard to stop once started.`,
  },
  {
    id: 'hist-french-revolution',
    subject: 'History',
    topic: 'French Revolution',
    tags: ['humanities', 'conceptual'],
    content: `What caused the French Revolution?

Key causes:
1. Social inequality: The Three Estates system. First Estate (clergy) and Second Estate (nobility) had privileges. Third Estate (97% of population) bore the tax burden.
2. Financial crisis: France was bankrupt from wars (including helping America's revolution) and royal extravagance.
3. Enlightenment ideas: Philosophers like Rousseau and Voltaire challenged the divine right of kings.
4. Food shortages: Bad harvests drove bread prices up, causing widespread hunger.

Key events:
- 1789: Storming of the Bastille (July 14)
- Declaration of the Rights of Man
- 1793: Execution of Louis XVI
- Reign of Terror under Robespierre
- 1799: Napoleon takes power

Was the Revolution worth the violence?

This is debated. It ended feudal privileges and inspired democracy worldwide, but the Reign of Terror killed thousands of innocents, and France cycled through republic, empire, and monarchy for decades after.`,
  },
  {
    id: 'hist-industrial-revolution',
    subject: 'History',
    topic: 'Industrial Revolution',
    tags: ['humanities', 'conceptual'],
    content: `What was the Industrial Revolution?

A transformation from agricultural to industrial economies, starting in Britain around 1760-1840.

Why Britain first?
- Natural resources: coal, iron, water power
- Colonial empire: raw materials and markets
- Stable government and property rights
- Agricultural revolution freed labor for factories

Key innovations:
- Spinning Jenny and water frame (textiles)
- Steam engine (James Watt, 1769)
- Railways (1825+)
- Iron and steel production

Social impacts:
- Urbanization: mass migration to cities
- New social classes: industrial middle class and working class
- Child labor and poor working conditions
- Eventually led to labor movements and reforms

Did living standards improve or get worse?

Initially worse for many workers — long hours, dangerous conditions, cramped housing. But over decades, productivity gains raised living standards dramatically. The debate (called the "standard of living debate") continues among historians.`,
  },

  // ─── HUMANITIES: Literature ────────────────────────────────────────
  {
    id: 'lit-hamlet',
    subject: 'Literature',
    topic: 'Hamlet Themes',
    tags: ['humanities', 'conceptual'],
    content: `What are the main themes in Hamlet?

Key themes in Shakespeare's Hamlet:

1. Indecision and inaction: Hamlet knows his uncle Claudius murdered his father but delays revenge endlessly. "To be or not to be" captures his paralysis.

2. Appearance vs reality: Characters wear masks. Claudius appears a good king but is a murderer. Hamlet feigns madness. Polonius spies behind curtains.

3. Corruption and decay: Denmark is described as a "prison" and "something is rotten in the state of Denmark." The corruption spreads from the throne outward.

4. Death and the afterlife: The ghost, the graveyard scene with Yorick's skull, Ophelia's drowning — death permeates the play.

5. Revenge: The play questions whether revenge is justified and at what cost.

Why doesn't Hamlet just kill Claudius immediately?

That's THE question of the play. Possible reasons: moral uncertainty, fear of damnation, depression, Oedipal complex (Freudian reading), or philosophical nature. Shakespeare deliberately leaves it ambiguous.`,
  },

  // ─── CROSS-DOMAIN: Connections ─────────────────────────────────────
  {
    id: 'cross-math-physics',
    subject: 'Mathematics',
    topic: 'Vectors in Physics',
    tags: ['math', 'stem', 'notation'],
    content: `How do vectors apply to physics?

A vector has both magnitude and direction. In physics:
- Velocity is a vector (speed + direction)
- Force is a vector (magnitude + direction)

Adding vectors: Place them tip to tail, or use components:
F₁ = (3, 4) and F₂ = (1, -2)
F_total = (3+1, 4+(-2)) = (4, 2)

Magnitude: |F| = √(4² + 2²) = √20 ≈ 4.47 N
Direction: θ = arctan(2/4) ≈ 26.6° above horizontal

When a force acts at an angle:
Fx = F·cos(θ) — horizontal component
Fy = F·sin(θ) — vertical component

Why do we decompose vectors into components?

Because we can solve each direction independently! A projectile's horizontal motion (constant velocity) is completely independent of its vertical motion (accelerated by gravity).`,
  },
  {
    id: 'cross-bio-chem',
    subject: 'Biology',
    topic: 'Biochemistry of Enzymes',
    tags: ['stem', 'conceptual'],
    content: `How do enzymes work?

Enzymes are biological catalysts — proteins that speed up chemical reactions without being consumed.

Lock and key model: Each enzyme has an active site that fits a specific substrate, like a lock and key. Modern view (induced fit): the active site changes shape slightly to grip the substrate.

Factors affecting enzyme activity:
- Temperature: Too low = slow, optimal = fastest, too high = denatured (shape destroyed)
- pH: Each enzyme has an optimal pH (pepsin in stomach: pH 2, trypsin in intestine: pH 8)
- Substrate concentration: More substrate = faster, until all enzymes are occupied (saturation)

Can an enzyme work on any molecule?

No! Enzymes are highly specific. Lactase only breaks down lactose, amylase only breaks down starch. This specificity comes from the precise 3D shape of the active site.`,
  },

  // ─── Additional STEM with heavy notation ───────────────────────────
  {
    id: 'math-derivatives',
    subject: 'Mathematics',
    topic: 'Introduction to Derivatives',
    tags: ['math', 'stem', 'notation'],
    content: `What is a derivative?

A derivative measures the rate of change — the slope of a function at any point.

f'(x) = lim(h→0) [f(x+h) - f(x)] / h

Power rule (most common):
If f(x) = x^n, then f'(x) = nx^(n-1)

Examples:
- f(x) = x³ → f'(x) = 3x²
- f(x) = 5x² → f'(x) = 10x
- f(x) = x → f'(x) = 1
- f(x) = 7 (constant) → f'(x) = 0

Product rule: (fg)' = f'g + fg'
Chain rule: [f(g(x))]' = f'(g(x)) · g'(x)

What does the derivative actually tell us in real life?

If distance is s(t) = 4t², the derivative s'(t) = 8t gives velocity at time t. At t=3: velocity = 24 m/s. The derivative of velocity gives acceleration.`,
  },
  {
    id: 'math-probability',
    subject: 'Mathematics',
    topic: 'Basic Probability',
    tags: ['math', 'stem', 'notation'],
    content: `How does probability work?

P(event) = favorable outcomes / total outcomes

Rolling a die: P(getting a 4) = 1/6

Two rules:
- AND (both events): P(A and B) = P(A) × P(B) for independent events
  P(two heads in a row) = 1/2 × 1/2 = 1/4
- OR (either event): P(A or B) = P(A) + P(B) - P(A and B)
  P(king or heart) = 4/52 + 13/52 - 1/52 = 16/52

Complementary events: P(not A) = 1 - P(A)
P(at least one head in 3 flips) = 1 - P(no heads) = 1 - (1/2)³ = 7/8

Why do we subtract P(A and B) in the OR rule?

To avoid double-counting! The king of hearts is both a king AND a heart. If we just add, we count it twice.`,
  },
  {
    id: 'chem-bonding',
    subject: 'Chemistry',
    topic: 'Chemical Bonding',
    tags: ['stem', 'conceptual'],
    content: `What are the types of chemical bonds?

Three main types:

1. Ionic bonds: Electrons transferred between atoms. Metal + nonmetal. Example: NaCl — sodium gives an electron to chlorine. Creates ions (Na⁺, Cl⁻) held by electrostatic attraction. High melting points, conduct electricity when dissolved.

2. Covalent bonds: Electrons shared between atoms. Nonmetal + nonmetal. Example: H₂O — oxygen shares electrons with two hydrogens. Can be polar (unequal sharing) or nonpolar (equal sharing).

3. Metallic bonds: Sea of delocalized electrons shared among metal atoms. Explains why metals conduct electricity and are malleable.

Why is water a liquid but CO₂ is a gas at room temperature?

Water molecules form hydrogen bonds with each other (strong intermolecular forces). CO₂ molecules only have weak London dispersion forces. Stronger intermolecular forces = higher boiling point.`,
  },

  // ─── Czech language content (for multilingual testing) ─────────────
  {
    id: 'math-fractions-cz',
    subject: 'Matematika',
    topic: 'Zlomky',
    tags: ['math', 'stem', 'notation'],
    content: `Jak se sčítají zlomky?

Pro sčítání zlomků potřebujeme společný jmenovatel.

Příklad: 1/3 + 1/4
1. Nejmenší společný násobek 3 a 4 je 12
2. Převedeme: 4/12 + 3/12
3. Sečteme čitatele: 7/12

Pro násobení je to jednodušší — násobíme čitatel čitatelem a jmenovatel jmenovatelem:
2/3 × 3/5 = 6/15 = 2/5

Pro dělení zlomků násobíme převrácenou hodnotou:
2/3 ÷ 4/5 = 2/3 × 5/4 = 10/12 = 5/6

Proč nemůžeme prostě sečíst čitatele a jmenovatele?

Protože zlomky představují části různě velkých celků! Třetina pizzy a čtvrtina pizzy jsou různě velké kousky — musíme je nejdřív "rozřezat" na stejně velké části.`,
  },
  {
    id: 'physics-optics-cz',
    subject: 'Fyzika',
    topic: 'Optika a světlo',
    tags: ['stem', 'conceptual'],
    content: `Jak funguje lom světla?

Když světlo přechází z jednoho prostředí do druhého (například ze vzduchu do vody), mění rychlost a směr. Tomuto jevu říkáme lom světla.

Snellův zákon: n₁·sin(θ₁) = n₂·sin(θ₂)

kde n je index lomu prostředí (vzduch ≈ 1, voda ≈ 1.33, sklo ≈ 1.5).

Příklad: Když světlo dopadá ze vzduchu na vodní hladinu pod úhlem 45°:
1·sin(45°) = 1.33·sin(θ₂)
sin(θ₂) = 0.707/1.33 = 0.532
θ₂ ≈ 32.1°

Světlo se lomí směrem k normále, protože voda je opticky hustší.

Proč vypadá lžička ve sklenici vody zlomená?

Protože světlo z části lžičky pod vodou mění směr na rozhraní voda-vzduch. Naše oči "domýšlí" přímočarý průběh paprsků, takže vidíme lžičku posunutou.`,
  },

  // ─── More varied content to reach ~80 chunks ───────────────────────
  {
    id: 'math-sequences',
    subject: 'Mathematics',
    topic: 'Arithmetic and Geometric Sequences',
    tags: ['math', 'stem', 'notation'],
    content: `What's the difference between arithmetic and geometric sequences?

Arithmetic sequence: constant difference between terms
  2, 5, 8, 11, 14... (d = 3)
  Formula: a_n = a₁ + (n-1)d
  Sum: S_n = n/2 × (a₁ + a_n)

Geometric sequence: constant ratio between terms
  3, 6, 12, 24, 48... (r = 2)
  Formula: a_n = a₁ × r^(n-1)
  Sum: S_n = a₁(1 - r^n) / (1 - r)

Example: Find the 10th term of 2, 5, 8, 11...
  a₁₀ = 2 + (10-1)(3) = 2 + 27 = 29

Is there a sequence that's neither arithmetic nor geometric?

Yes! Fibonacci: 1, 1, 2, 3, 5, 8, 13... Each term is the sum of the two before it. It's neither constant difference nor constant ratio.`,
  },
  {
    id: 'math-statistics',
    subject: 'Mathematics',
    topic: 'Mean, Median, Mode',
    tags: ['math', 'stem'],
    content: `What are mean, median, and mode?

Given data: 3, 7, 7, 12, 15

Mean (average): (3 + 7 + 7 + 12 + 15) / 5 = 44/5 = 8.8
Median (middle value): 7 (when sorted, it's the 3rd of 5 values)
Mode (most frequent): 7 (appears twice)

Standard deviation measures spread — how far values typically are from the mean.

When should I use median instead of mean?

When data has outliers! Income data: 30k, 35k, 40k, 42k, 2M. Mean = ~429k (misleading — pulled up by the millionaire). Median = 40k (much more representative). That's why "median household income" is used in economics.`,
  },
  {
    id: 'physics-momentum',
    subject: 'Physics',
    topic: 'Momentum and Collisions',
    tags: ['stem', 'notation'],
    content: `What is momentum?

Momentum = mass × velocity (p = mv)

A 1000kg car at 20 m/s: p = 20,000 kg·m/s
A 5kg bowling ball at 10 m/s: p = 50 kg·m/s

Conservation of momentum: In collisions, total momentum before = total momentum after.

Elastic collision (both objects bounce): kinetic energy conserved
  m₁v₁ + m₂v₂ = m₁v₁' + m₂v₂'

Inelastic collision (objects stick together): kinetic energy NOT conserved
  m₁v₁ + m₂v₂ = (m₁ + m₂)v'

Example: 2kg ball at 3 m/s hits stationary 1kg ball, they stick:
  2(3) + 1(0) = (2+1)v'
  v' = 2 m/s

Why do airbags save lives?

Airbags increase the time of collision. Impulse (force × time) equals change in momentum. Same momentum change over longer time = less force on the person.`,
  },
  {
    id: 'bio-ecology',
    subject: 'Biology',
    topic: 'Ecosystems and Food Webs',
    tags: ['stem', 'conceptual'],
    content: `How do ecosystems work?

Energy flows through ecosystems in one direction:
Sun → Producers → Primary consumers → Secondary consumers → Decomposers

Energy pyramid: Each level retains only ~10% of energy from below.
- 1000J of sunlight → 100J in plants → 10J in herbivores → 1J in carnivores

This is why there are fewer top predators than prey — there's not enough energy to support many.

Food webs show interconnected feeding relationships. A real ecosystem has many overlapping food chains.

Key terms:
- Producers (autotrophs): Make own food (plants, algae)
- Consumers (heterotrophs): Eat others
- Decomposers: Break down dead matter, recycling nutrients

Why does removing one species affect the whole ecosystem?

Ecosystems are interconnected. Remove wolves from Yellowstone → deer overpopulate → overgraze vegetation → rivers erode differently → entire landscape changes. This is called a trophic cascade.`,
  },
  {
    id: 'bio-immune',
    subject: 'Biology',
    topic: 'Immune System',
    tags: ['stem', 'conceptual'],
    content: `How does the immune system protect us?

Three lines of defense:

1. Physical barriers: Skin, mucus, tears, stomach acid — prevent pathogens from entering.

2. Innate (non-specific) immunity: White blood cells (phagocytes) that attack anything foreign. Inflammation brings more blood flow to infected areas. Fever makes the body hostile to pathogens.

3. Adaptive (specific) immunity: B cells produce antibodies that target specific pathogens. T cells directly kill infected cells. Memory cells "remember" pathogens for faster future responses.

This is why vaccines work — they train your adaptive immune system by exposing it to a harmless version of the pathogen. Your memory cells then recognize the real pathogen instantly.

Why do we get sick again from different cold viruses?

Because each cold virus strain is slightly different. Your memory cells learned to recognize one version, but the new strain's surface proteins look different enough to evade recognition.`,
  },
  {
    id: 'hist-cold-war',
    subject: 'History',
    topic: 'Cold War Overview',
    tags: ['humanities', 'conceptual'],
    content: `What was the Cold War?

A period of geopolitical tension (1947-1991) between the USA (capitalism, democracy) and USSR (communism, one-party state). "Cold" because they never fought directly — instead through:

- Proxy wars: Korea, Vietnam, Afghanistan
- Arms race: Both built thousands of nuclear weapons
- Space race: Sputnik (1957) → Moon landing (1969)
- Ideological competition: Each tried to spread their system globally

Key moments:
- Berlin Wall (1961-1989)
- Cuban Missile Crisis (1962) — closest to nuclear war
- Détente period (1970s) — reduced tensions
- Fall of Berlin Wall (1989)
- USSR dissolution (1991)

Why didn't the Cold War turn hot?

Mutually Assured Destruction (MAD). Both sides had enough nuclear weapons to destroy each other completely. Starting a nuclear war meant guaranteed self-destruction, which deterred both sides.`,
  },
  {
    id: 'lit-romeo-juliet',
    subject: 'Literature',
    topic: 'Romeo and Juliet Themes',
    tags: ['humanities', 'conceptual'],
    content: `What are the key themes in Romeo and Juliet?

1. Love vs hate: The lovers' pure love contrasts with their families' bitter feud. Love is portrayed as both transcendent and destructive.

2. Fate vs free will: "Star-crossed lovers" suggests fate controls them. But their own impulsive choices (secret marriage, poison) drive the tragedy. Shakespeare leaves the tension unresolved.

3. Youth vs age: The young lovers act impulsively; the older generation perpetuates the feud. Neither generation communicates effectively.

4. Light and dark imagery: Romeo compares Juliet to the sun, but they can only meet at night. Their love exists in darkness, hidden from the hostile daylight world.

5. Time pressure: Everything happens in just 4 days! This compressed timeline heightens the sense of urgency and inevitability.

Is Romeo and Juliet really a love story?

It's complicated. Some scholars argue it's a cautionary tale about impulsive passion, not a model romance. They've known each other for hours before deciding to marry. Shakespeare may be critiquing teen impulsivity as much as celebrating love.`,
  },

  // ─── Geography ─────────────────────────────────────────────────────
  {
    id: 'geo-plate-tectonics',
    subject: 'Geography',
    topic: 'Plate Tectonics',
    tags: ['stem', 'conceptual'],
    content: `How do tectonic plates work?

Earth's crust is broken into ~15 major plates floating on the semi-liquid mantle. Plates move 2-10 cm/year, driven by convection currents in the mantle.

Three types of boundaries:
1. Divergent: Plates move apart. Magma rises to fill the gap → new crust. Example: Mid-Atlantic Ridge.
2. Convergent: Plates collide. Oceanic plate subducts under continental → volcanoes. Two continental plates → mountains (Himalayas).
3. Transform: Plates slide past each other → earthquakes. Example: San Andreas Fault.

Evidence: Continental shapes fit together (South America + Africa), identical fossils found on separate continents, matching rock formations across oceans.

Why are earthquakes more common in some areas?

Most earthquakes occur at plate boundaries where stress accumulates. The "Ring of Fire" around the Pacific has 75% of the world's volcanoes and 90% of earthquakes because multiple plates meet there.`,
  },

  // ─── More math-heavy content for notation testing ──────────────────
  {
    id: 'math-matrices',
    subject: 'Mathematics',
    topic: 'Matrix Operations',
    tags: ['math', 'stem', 'notation'],
    content: `How do you multiply matrices?

Matrix multiplication: for A(m×n) × B(n×p) = C(m×p), each element c_ij is the dot product of row i of A and column j of B.

Example:
A = [1 2]    B = [5 6]
    [3 4]        [7 8]

C = [1×5+2×7  1×6+2×8] = [19 22]
    [3×5+4×7  3×6+4×8]   [43 50]

Important: AB ≠ BA in general! Matrix multiplication is NOT commutative.

Identity matrix I: AI = IA = A
I = [1 0]
    [0 1]

Inverse: A × A⁻¹ = I

When can't you multiply two matrices?

The number of columns in the first matrix must equal the number of rows in the second. A 2×3 matrix can multiply a 3×4 matrix (result is 2×4), but NOT a 2×4 matrix.`,
  },
  {
    id: 'math-complex-numbers',
    subject: 'Mathematics',
    topic: 'Complex Numbers',
    tags: ['math', 'stem', 'notation'],
    content: `What are complex numbers?

Complex numbers extend real numbers with i, where i² = -1.

Form: a + bi (a = real part, b = imaginary part)

Operations:
- Addition: (3 + 2i) + (1 - 4i) = 4 - 2i
- Multiplication: (3 + 2i)(1 - 4i) = 3 - 12i + 2i - 8i² = 3 - 10i + 8 = 11 - 10i
- Conjugate of a + bi is a - bi

Modulus: |a + bi| = √(a² + b²)

Why do we need imaginary numbers?

They solve equations like x² + 1 = 0 that have no real solutions. But they're far from imaginary — they're essential in electrical engineering (AC circuits), quantum mechanics, signal processing, and fluid dynamics.`,
  },
  {
    id: 'physics-thermodynamics',
    subject: 'Physics',
    topic: 'Laws of Thermodynamics',
    tags: ['stem', 'conceptual', 'notation'],
    content: `What are the laws of thermodynamics?

0th Law: If A is in thermal equilibrium with C, and B is in thermal equilibrium with C, then A and B are in equilibrium. (Basis for temperature measurement.)

1st Law: Energy is conserved. ΔU = Q - W
  ΔU = change in internal energy
  Q = heat added to system
  W = work done by system

2nd Law: Entropy of an isolated system never decreases. Heat flows spontaneously from hot to cold, never the reverse. No engine can be 100% efficient.

3rd Law: As temperature approaches absolute zero (0 K = -273.15°C), entropy approaches a minimum.

Why can't we build a perpetual motion machine?

The 1st law says you can't create energy from nothing. The 2nd law says you can't even break even — every energy conversion loses some energy as waste heat. A perpetual machine would violate both.`,
  },
  {
    id: 'chem-stoichiometry',
    subject: 'Chemistry',
    topic: 'Stoichiometry Calculations',
    tags: ['stem', 'notation'],
    content: `How do I do stoichiometry calculations?

Stoichiometry uses mole ratios from balanced equations to calculate amounts.

Example: How many grams of O₂ are needed to burn 44g of propane (C₃H₈)?

Step 1: Balance: C₃H₈ + 5O₂ → 3CO₂ + 4H₂O

Step 2: Convert grams to moles:
  Molar mass of C₃H₈ = 3(12) + 8(1) = 44 g/mol
  44g ÷ 44 g/mol = 1 mol C₃H₈

Step 3: Use mole ratio:
  1 mol C₃H₈ × (5 mol O₂ / 1 mol C₃H₈) = 5 mol O₂

Step 4: Convert moles to grams:
  5 mol × 32 g/mol = 160g O₂

What is a limiting reagent?

The reactant that runs out first, stopping the reaction. Like making sandwiches: with 10 bread slices and 3 meat portions, meat is limiting — you can only make 3 sandwiches regardless of bread.`,
  },
  {
    id: 'math-functions',
    subject: 'Mathematics',
    topic: 'Functions and Graphs',
    tags: ['math', 'stem'],
    content: `What makes something a function?

A function assigns exactly ONE output to each input. f(x) = x² is a function because every x gives one y. The circle x² + y² = 1 is NOT a function because x = 0 gives both y = 1 and y = -1.

Vertical line test: If any vertical line crosses the graph more than once, it's not a function.

Key function types:
- Linear: f(x) = mx + b (straight line)
- Quadratic: f(x) = ax² + bx + c (parabola)
- Exponential: f(x) = a^x (rapid growth/decay)
- Logarithmic: f(x) = log(x) (inverse of exponential)

Domain: all valid inputs (can't divide by 0 or take √ of negatives)
Range: all possible outputs

Why is the domain of f(x) = 1/x all numbers except 0?

Because 1/0 is undefined — it doesn't equal any number. As x approaches 0, 1/x grows without bound. There's no value we can assign to f(0).`,
  },
  {
    id: 'bio-mitosis',
    subject: 'Biology',
    topic: 'Mitosis and Cell Division',
    tags: ['stem', 'conceptual'],
    content: `How does mitosis work?

Mitosis produces two identical daughter cells from one parent cell. Used for growth, repair, and asexual reproduction.

Phases:
1. Prophase: Chromosomes condense, become visible. Nuclear membrane begins to break down. Spindle fibers form.
2. Metaphase: Chromosomes line up at the cell's equator (metaphase plate).
3. Anaphase: Sister chromatids separate and move to opposite poles.
4. Telophase: Nuclear membranes reform around each set of chromosomes. Chromosomes decondense.
5. Cytokinesis: Cytoplasm divides, creating two separate cells.

Result: 2 cells, each with the same number of chromosomes as the original (diploid → diploid).

How is mitosis different from meiosis?

Mitosis: 1 division → 2 identical cells (for growth). Meiosis: 2 divisions → 4 unique cells with half the chromosomes (for sex cells/gametes). Meiosis includes crossing over, which creates genetic diversity.`,
  },
  {
    id: 'physics-magnetism',
    subject: 'Physics',
    topic: 'Electromagnetism',
    tags: ['stem', 'conceptual', 'notation'],
    content: `How are electricity and magnetism connected?

Moving charges create magnetic fields. Changing magnetic fields create electric currents. This is electromagnetism.

Key discoveries:
- Oersted (1820): Current-carrying wire deflects a compass → electricity creates magnetism
- Faraday (1831): Moving a magnet through a coil induces current → magnetism creates electricity

Faraday's Law: EMF = -N × dΦ/dt
  EMF = voltage induced
  N = number of coil turns
  dΦ/dt = rate of change of magnetic flux

Applications: Electric generators, transformers, wireless charging, MRI machines.

Why does spinning a magnet near a coil produce electricity?

The changing magnetic field "pushes" electrons in the wire. The faster you spin, the more voltage. This is how all power plants work — whether coal, nuclear, hydro, or wind — they all spin magnets near coils.`,
  },
  {
    id: 'math-coordinate-geometry',
    subject: 'Mathematics',
    topic: 'Coordinate Geometry',
    tags: ['math', 'stem', 'notation'],
    content: `How do I find the equation of a line?

Slope-intercept form: y = mx + b
  m = slope = rise/run = (y₂ - y₁)/(x₂ - x₁)
  b = y-intercept (where line crosses y-axis)

Point-slope form: y - y₁ = m(x - x₁)

Example: Line through (2, 3) and (4, 7):
  m = (7 - 3)/(4 - 2) = 4/2 = 2
  y - 3 = 2(x - 2)
  y = 2x - 1

Distance between two points: d = √[(x₂-x₁)² + (y₂-y₁)²]
Midpoint: ((x₁+x₂)/2, (y₁+y₂)/2)

Parallel lines have equal slopes. Perpendicular lines have slopes that are negative reciprocals (m₁ × m₂ = -1).

How do I find where two lines intersect?

Set their equations equal! If y = 2x - 1 and y = -x + 5: 2x - 1 = -x + 5, so 3x = 6, x = 2, y = 3. The intersection is (2, 3).`,
  },
  {
    id: 'chem-gas-laws',
    subject: 'Chemistry',
    topic: 'Gas Laws',
    tags: ['stem', 'notation'],
    content: `What are the gas laws?

Ideal Gas Law: PV = nRT
  P = pressure (atm), V = volume (L), n = moles, R = 0.0821 L·atm/(mol·K), T = temperature (K)

Individual laws:
- Boyle's Law: P₁V₁ = P₂V₂ (constant T, n) — squeeze a gas, pressure rises
- Charles's Law: V₁/T₁ = V₂/T₂ (constant P, n) — heat a gas, it expands
- Avogadro's Law: V₁/n₁ = V₂/n₂ (constant T, P) — more gas, more volume
- Dalton's Law: P_total = P₁ + P₂ + P₃... (partial pressures add up)

Example: 2 mol of gas at 300K and 1 atm:
V = nRT/P = 2(0.0821)(300)/1 = 49.3 L

Why is it called the "ideal" gas law?

Real gases deviate at high pressure (molecules have volume) and low temperature (molecules attract each other). The law assumes molecules are point particles with no interactions — "ideal" conditions.`,
  },
];

// ---------------------------------------------------------------------------
// Test queries with ground truth
// ---------------------------------------------------------------------------

const TEST_QUERIES: TestQuery[] = [
  // Direct matches
  {
    id: 'q-quadratic-direct',
    query: 'What is the quadratic formula?',
    expectedChunkIds: ['math-quadratic-formula'],
    tags: ['direct', 'notation'],
  },
  {
    id: 'q-photosynthesis-direct',
    query: 'How does photosynthesis work?',
    expectedChunkIds: ['bio-photosynthesis'],
    tags: ['direct'],
  },
  {
    id: 'q-newtons-laws',
    query: "What are Newton's laws of motion?",
    expectedChunkIds: ['physics-newtons-laws'],
    tags: ['direct'],
  },
  {
    id: 'q-dna-structure',
    query: 'Explain the structure of DNA',
    expectedChunkIds: ['bio-dna'],
    tags: ['direct'],
  },
  {
    id: 'q-hamlet',
    query: "What are the themes in Shakespeare's Hamlet?",
    expectedChunkIds: ['lit-hamlet'],
    tags: ['direct'],
  },

  // Paraphrased / synonym queries
  {
    id: 'q-second-degree',
    query: 'How to solve second-degree polynomial equations',
    expectedChunkIds: [
      'math-quadratic-formula',
      'math-completing-square',
      'math-factoring',
    ],
    tags: ['paraphrase', 'notation'],
  },
  {
    id: 'q-plant-energy',
    query: 'How do plants convert sunlight into food?',
    expectedChunkIds: ['bio-photosynthesis'],
    tags: ['paraphrase'],
  },
  {
    id: 'q-electricity-resistance',
    query: 'What is the relationship between voltage, current, and resistance?',
    expectedChunkIds: ['physics-electricity'],
    tags: ['paraphrase'],
  },
  {
    id: 'q-genetic-inheritance',
    query: 'How are traits passed from parents to children?',
    expectedChunkIds: ['bio-genetics', 'bio-dna'],
    tags: ['paraphrase', 'conceptual'],
  },
  {
    id: 'q-ww1-reasons',
    query: 'What factors led to the outbreak of the First World War?',
    expectedChunkIds: ['hist-wwi-causes'],
    tags: ['paraphrase'],
  },

  // Math notation / symbol heavy queries
  {
    id: 'q-solve-x-squared',
    query: 'Solve x² + 5x + 6 = 0',
    expectedChunkIds: ['math-factoring', 'math-quadratic-formula'],
    tags: ['notation'],
  },
  {
    id: 'q-discriminant',
    query: 'What is b² - 4ac and what does it tell you?',
    expectedChunkIds: ['math-quadratic-formula'],
    tags: ['notation'],
  },
  {
    id: 'q-derivative-power-rule',
    query: "Find f'(x) when f(x) = x³",
    expectedChunkIds: ['math-derivatives'],
    tags: ['notation'],
  },
  {
    id: 'q-matrix-multiply',
    query: 'How do you multiply 2x2 matrices?',
    expectedChunkIds: ['math-matrices'],
    tags: ['notation'],
  },
  {
    id: 'q-balance-equation',
    query: 'Balance Fe + O₂ → Fe₂O₃',
    expectedChunkIds: ['chem-balancing'],
    tags: ['notation'],
  },

  // Cross-topic / conceptual queries
  {
    id: 'q-photo-resp-connection',
    query: 'How are photosynthesis and cellular respiration related?',
    expectedChunkIds: ['bio-photosynthesis', 'bio-cell-respiration'],
    tags: ['cross-topic', 'conceptual'],
  },
  {
    id: 'q-energy-forms',
    query: 'What happens to energy when a ball is dropped?',
    expectedChunkIds: ['physics-energy', 'physics-gravity'],
    tags: ['cross-topic', 'conceptual'],
  },
  {
    id: 'q-revolution-comparison',
    query: 'What role did social inequality play in political revolutions?',
    expectedChunkIds: ['hist-french-revolution'],
    tags: ['cross-topic', 'conceptual'],
  },
  {
    id: 'q-trig-physics',
    query: 'How are trigonometric functions used to decompose forces?',
    expectedChunkIds: ['cross-math-physics', 'math-trig-basics'],
    tags: ['cross-topic', 'notation'],
  },

  // Tricky disambiguation queries
  {
    id: 'q-completing-vs-formula',
    query: 'Should I complete the square or use the quadratic formula?',
    expectedChunkIds: ['math-completing-square', 'math-quadratic-formula'],
    tags: ['cross-topic', 'conceptual'],
  },
  {
    id: 'q-ionic-vs-covalent',
    query: 'When does electron transfer happen vs electron sharing?',
    expectedChunkIds: ['chem-bonding'],
    tags: ['conceptual'],
  },
  {
    id: 'q-mitosis-vs-meiosis',
    query:
      'What produces identical cells versus unique cells with half the chromosomes?',
    expectedChunkIds: ['bio-mitosis'],
    tags: ['conceptual'],
  },

  // Czech language queries
  {
    id: 'q-zlomky-cz',
    query: 'Jak se sčítají zlomky s různým jmenovatelem?',
    expectedChunkIds: ['math-fractions-cz'],
    tags: ['direct'],
  },
  {
    id: 'q-optics-cz',
    query: 'Proč vypadá lžička ve vodě zlomená?',
    expectedChunkIds: ['physics-optics-cz'],
    tags: ['direct'],
  },

  // Edge case: vague / broad queries
  {
    id: 'q-exponent-rules',
    query: 'Rules for powers and exponents',
    expectedChunkIds: ['math-exponents'],
    tags: ['paraphrase'],
  },
  {
    id: 'q-perpetual-motion',
    query: 'Why is perpetual motion impossible?',
    expectedChunkIds: ['physics-thermodynamics'],
    tags: ['conceptual'],
  },
];

// ---------------------------------------------------------------------------
// API Clients (raw fetch — no SDK dependencies)
// ---------------------------------------------------------------------------

async function embedOpenAI(
  texts: string[],
  apiKey: string,
  model = 'text-embedding-3-small'
): Promise<{ vectors: number[][]; tokensUsed: number; latencyMs: number }> {
  const start = performance.now();
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ input: texts, model }),
  });
  const latencyMs = performance.now() - start;

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${err}`);
  }

  const data = (await res.json()) as {
    data: Array<{ embedding: number[]; index: number }>;
    usage: { total_tokens: number };
  };

  // Sort by index to preserve order
  const sorted = data.data.sort((a, b) => a.index - b.index);
  return {
    vectors: sorted.map((d) => d.embedding),
    tokensUsed: data.usage.total_tokens,
    latencyMs,
  };
}

async function embedVoyage(
  texts: string[],
  apiKey: string,
  model = 'voyage-3.5',
  inputType: 'document' | 'query' = 'document'
): Promise<{ vectors: number[][]; tokensUsed: number; latencyMs: number }> {
  const start = performance.now();
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ input: texts, model, input_type: inputType }),
  });
  const latencyMs = performance.now() - start;

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Voyage API error ${res.status}: ${err}`);
  }

  const data = (await res.json()) as {
    data: Array<{ embedding: number[]; index: number }>;
    usage: { total_tokens: number };
  };

  const sorted = data.data.sort((a, b) => a.index - b.index);
  return {
    vectors: sorted.map((d) => d.embedding),
    tokensUsed: data.usage.total_tokens,
    latencyMs,
  };
}

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ---------------------------------------------------------------------------
// Retry with backoff (for rate-limited APIs)
// ---------------------------------------------------------------------------

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries = 5,
  initialDelayMs = 25_000
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRateLimit =
        err instanceof Error &&
        (err.message.includes('429') || err.message.includes('rate'));
      if (!isRateLimit || attempt === maxRetries) throw err;

      const delay = initialDelayMs * Math.pow(1.5, attempt);
      process.stdout.write(
        `    Rate limited on ${label}, waiting ${(delay / 1000).toFixed(
          0
        )}s (attempt ${attempt + 1}/${maxRetries})...\n`
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error('Unreachable');
}

// ---------------------------------------------------------------------------
// Benchmark runner
// ---------------------------------------------------------------------------

async function runBenchmark(
  providerName: string,
  model: string,
  embedDocsFn: (
    texts: string[]
  ) => Promise<{ vectors: number[][]; tokensUsed: number; latencyMs: number }>,
  embedQueryFn: (
    texts: string[]
  ) => Promise<{ vectors: number[][]; tokensUsed: number; latencyMs: number }>
): Promise<BenchmarkResult> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  Benchmarking: ${providerName} (${model})`);
  console.log(`${'='.repeat(60)}`);

  // 1. Embed all document chunks (batch)
  console.log(`  Embedding ${CONTENT_CHUNKS.length} content chunks...`);
  const docTexts = CONTENT_CHUNKS.map((c) => c.content);

  // Batch in groups of 10 with retry/backoff for rate-limited APIs
  const BATCH_SIZE = 10;
  const allDocVectors: number[][] = [];
  let totalDocTokens = 0;
  let totalDocLatency = 0;
  const totalBatches = Math.ceil(docTexts.length / BATCH_SIZE);

  for (let i = 0; i < docTexts.length; i += BATCH_SIZE) {
    const batch = docTexts.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const result = await retryWithBackoff(
      () => embedDocsFn(batch),
      `doc batch ${batchNum}/${totalBatches}`
    );
    allDocVectors.push(...result.vectors);
    totalDocTokens += result.tokensUsed;
    totalDocLatency += result.latencyMs;
    process.stdout.write(
      `    Batch ${batchNum}/${totalBatches} done (${result.latencyMs.toFixed(
        0
      )}ms)\n`
    );
  }

  console.log(
    `  Documents embedded: ${
      allDocVectors.length
    } vectors, ${totalDocTokens} tokens, ${totalDocLatency.toFixed(0)}ms total`
  );

  // 2. Embed all queries (batch with retry)
  console.log(`  Embedding ${TEST_QUERIES.length} queries...`);
  const queryTexts = TEST_QUERIES.map((q) => q.query);
  const queryResult = await retryWithBackoff(
    () => embedQueryFn(queryTexts),
    'query batch'
  );
  const queryVectors = queryResult.vectors;

  console.log(
    `  Queries embedded: ${queryVectors.length} vectors, ${
      queryResult.tokensUsed ?? 0
    } tokens, ${queryResult.latencyMs.toFixed(0)}ms`
  );

  // 3. Evaluate retrieval quality
  let totalReciprocal = 0;
  let recall1Count = 0;
  let recall3Count = 0;
  let recall5Count = 0;
  const tagStats: Record<
    string,
    { recall5: number; mrr: number; count: number }
  > = {};
  const queryDetails: BenchmarkResult['queryDetails'] = [];

  for (let qi = 0; qi < TEST_QUERIES.length; qi++) {
    const query = TEST_QUERIES[qi];
    const qVec = queryVectors[qi];

    // Score all chunks
    const scores = CONTENT_CHUNKS.map((chunk, ci) => ({
      chunkId: chunk.id,
      topic: chunk.topic,
      score: cosineSimilarity(qVec, allDocVectors[ci]),
    })).sort((a, b) => b.score - a.score);

    const top5 = scores.slice(0, 5);

    // Find first correct match position
    let firstCorrectRank = -1;
    for (let rank = 0; rank < scores.length; rank++) {
      if (query.expectedChunkIds.includes(scores[rank].chunkId)) {
        firstCorrectRank = rank + 1;
        break;
      }
    }

    const reciprocalRank = firstCorrectRank > 0 ? 1 / firstCorrectRank : 0;
    totalReciprocal += reciprocalRank;

    const correctInTop1 = firstCorrectRank === 1;
    const correctInTop3 = firstCorrectRank > 0 && firstCorrectRank <= 3;
    const correctInTop5 = firstCorrectRank > 0 && firstCorrectRank <= 5;

    if (correctInTop1) recall1Count++;
    if (correctInTop3) recall3Count++;
    if (correctInTop5) recall5Count++;

    // Update tag stats
    for (const tag of query.tags) {
      if (!tagStats[tag]) tagStats[tag] = { recall5: 0, mrr: 0, count: 0 };
      tagStats[tag].count++;
      tagStats[tag].mrr += reciprocalRank;
      if (correctInTop5) tagStats[tag].recall5++;
    }

    queryDetails.push({
      queryId: query.id,
      query: query.query,
      topMatches: top5,
      correctInTop5,
      reciprocalRank,
    });
  }

  // Normalize tag stats
  for (const tag of Object.keys(tagStats)) {
    const s = tagStats[tag];
    s.recall5 = s.recall5 / s.count;
    s.mrr = s.mrr / s.count;
  }

  return {
    provider: providerName,
    model,
    totalQueries: TEST_QUERIES.length,
    recall1: recall1Count / TEST_QUERIES.length,
    recall3: recall3Count / TEST_QUERIES.length,
    recall5: recall5Count / TEST_QUERIES.length,
    mrr: totalReciprocal / TEST_QUERIES.length,
    avgLatencyMs:
      (totalDocLatency + queryResult.latencyMs) /
      (Math.ceil(docTexts.length / BATCH_SIZE) + 1),
    totalTokens: totalDocTokens + queryResult.tokensUsed,
    tagBreakdown: tagStats,
    queryDetails,
  };
}

// ---------------------------------------------------------------------------
// Pretty printing
// ---------------------------------------------------------------------------

function printResults(results: BenchmarkResult[]): void {
  console.log(`\n${'━'.repeat(70)}`);
  console.log('  EMBEDDING BENCHMARK RESULTS — EduAgent Tutoring Content');
  console.log(`${'━'.repeat(70)}\n`);

  // Overall comparison table
  console.log('  Overall Metrics:');
  console.log(`  ${'─'.repeat(66)}`);
  console.log(
    `  ${'Metric'.padEnd(22)} ${results
      .map((r) => r.provider.padEnd(20))
      .join(' ')}`
  );
  console.log(`  ${'─'.repeat(66)}`);

  const metrics: Array<{
    label: string;
    getter: (r: BenchmarkResult) => string;
  }> = [
    { label: 'Model', getter: (r) => r.model },
    { label: 'Recall@1', getter: (r) => `${(r.recall1 * 100).toFixed(1)}%` },
    { label: 'Recall@3', getter: (r) => `${(r.recall3 * 100).toFixed(1)}%` },
    { label: 'Recall@5', getter: (r) => `${(r.recall5 * 100).toFixed(1)}%` },
    { label: 'MRR', getter: (r) => r.mrr.toFixed(3) },
    { label: 'Avg Latency', getter: (r) => `${r.avgLatencyMs.toFixed(0)}ms` },
    { label: 'Total Tokens', getter: (r) => r.totalTokens.toLocaleString() },
  ];

  for (const m of metrics) {
    console.log(
      `  ${m.label.padEnd(22)} ${results
        .map((r) => m.getter(r).padEnd(20))
        .join(' ')}`
    );
  }

  // Tag breakdown
  console.log(`\n  Tag Breakdown (Recall@5 / MRR):`);
  console.log(`  ${'─'.repeat(66)}`);

  const allTags = new Set<string>();
  for (const r of results) {
    for (const t of Object.keys(r.tagBreakdown)) allTags.add(t);
  }

  console.log(
    `  ${'Tag'.padEnd(16)} ${'Count'.padEnd(7)} ${results
      .map((r) => r.provider.padEnd(20))
      .join(' ')}`
  );

  for (const tag of [...allTags].sort()) {
    const count = results[0]?.tagBreakdown[tag]?.count ?? 0;
    const vals = results.map((r) => {
      const s = r.tagBreakdown[tag];
      if (!s) return 'N/A'.padEnd(20);
      return `${(s.recall5 * 100).toFixed(0)}% / ${s.mrr.toFixed(3)}`.padEnd(
        20
      );
    });
    console.log(
      `  ${tag.padEnd(16)} ${String(count).padEnd(7)} ${vals.join(' ')}`
    );
  }

  // Imperfect rankings (correct answer not at position 1)
  console.log(`\n  Imperfect Rankings (correct answer not #1):`);
  console.log(`  ${'─'.repeat(66)}`);

  let imperfectCount = 0;
  for (let qi = 0; qi < TEST_QUERIES.length; qi++) {
    const query = TEST_QUERIES[qi];
    const details = results.map((r) => r.queryDetails[qi]);

    const anyImperfect = details.some((d) => d.reciprocalRank < 1.0);
    const anyMissed = details.some((d) => !d.correctInTop5);
    const rrDiff =
      results.length > 1
        ? Math.abs(details[0].reciprocalRank - details[1].reciprocalRank)
        : 0;

    if (anyImperfect || anyMissed || rrDiff > 0.3) {
      imperfectCount++;
      console.log(`\n  Query: "${query.query}"`);
      console.log(`  Expected: ${query.expectedChunkIds.join(', ')}`);
      console.log(`  Tags: ${query.tags.join(', ')}`);
      for (let ri = 0; ri < results.length; ri++) {
        const d = details[ri];
        const status = d.correctInTop5
          ? d.reciprocalRank === 1
            ? '#1'
            : `#${Math.round(1 / d.reciprocalRank)}`
          : 'MISS';
        console.log(
          `  ${results[ri].provider}: ${status} (RR=${d.reciprocalRank.toFixed(
            3
          )}) — Top 5:`
        );
        for (const m of d.topMatches) {
          const isExpected = query.expectedChunkIds.includes(m.chunkId);
          const marker = isExpected ? ' <<<' : '';
          console.log(
            `      ${m.chunkId.padEnd(30)} ${m.score.toFixed(4)} (${
              m.topic
            })${marker}`
          );
        }
      }
    }
  }

  if (imperfectCount === 0) {
    console.log('  All queries returned correct result at position #1!');
  }

  // Winner summary
  if (results.length > 1) {
    console.log(`\n${'━'.repeat(70)}`);
    console.log('  SUMMARY');
    console.log(`${'━'.repeat(70)}`);

    const r0 = results[0];
    const r1 = results[1];

    const mrrDelta = ((r0.mrr - r1.mrr) / r1.mrr) * 100;
    const recall5Delta =
      ((r0.recall5 - r1.recall5) / (r1.recall5 || 0.01)) * 100;

    if (Math.abs(mrrDelta) < 3) {
      console.log(
        `  Result: DRAW — MRR difference is <3% (${mrrDelta.toFixed(1)}%)`
      );
      console.log(
        '  Recommendation: Choose based on cost, ecosystem, or latency'
      );
    } else {
      const winner = mrrDelta > 0 ? r0 : r1;
      const loser = mrrDelta > 0 ? r1 : r0;
      console.log(`  Winner: ${winner.provider} (${winner.model})`);
      console.log(
        `  MRR: ${winner.mrr.toFixed(3)} vs ${loser.mrr.toFixed(3)} (${Math.abs(
          mrrDelta
        ).toFixed(1)}% better)`
      );
      console.log(
        `  Recall@5: ${(winner.recall5 * 100).toFixed(1)}% vs ${(
          loser.recall5 * 100
        ).toFixed(1)}%`
      );

      // Check notation-specific performance
      const winnerNotation =
        winner.provider === r0.provider
          ? r0.tagBreakdown['notation']
          : r1.tagBreakdown['notation'];
      const loserNotation =
        winner.provider === r0.provider
          ? r1.tagBreakdown['notation']
          : r0.tagBreakdown['notation'];
      if (winnerNotation && loserNotation) {
        console.log(
          `  Math/Notation MRR: ${winnerNotation.mrr.toFixed(
            3
          )} vs ${loserNotation.mrr.toFixed(3)} (critical for STEM tutoring)`
        );
      }
    }
  }

  console.log(`\n${'━'.repeat(70)}\n`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const openaiKey = process.env.OPENAI_API_KEY;
  const voyageKey = process.env.VOYAGE_API_KEY;

  if (!openaiKey && !voyageKey) {
    console.error(
      'Error: Set at least one of OPENAI_API_KEY or VOYAGE_API_KEY\n\n' +
        'Usage:\n' +
        '  OPENAI_API_KEY=sk-... VOYAGE_API_KEY=pa-... pnpm exec tsx scripts/embedding-benchmark.ts\n\n' +
        'You can run with just one key to test a single provider.'
    );
    process.exit(1);
  }

  console.log('EduAgent Embedding Benchmark');
  console.log(`Content chunks: ${CONTENT_CHUNKS.length}`);
  console.log(`Test queries: ${TEST_QUERIES.length}`);
  console.log(
    `Providers: ${[openaiKey && 'OpenAI', voyageKey && 'Voyage AI']
      .filter(Boolean)
      .join(', ')}`
  );

  const results: BenchmarkResult[] = [];

  if (openaiKey) {
    const result = await runBenchmark(
      'OpenAI',
      'text-embedding-3-small',
      (texts) => embedOpenAI(texts, openaiKey),
      (texts) => embedOpenAI(texts, openaiKey)
    );
    results.push(result);
  }

  if (voyageKey) {
    const result = await runBenchmark(
      'Voyage AI',
      'voyage-3.5',
      (texts) => embedVoyage(texts, voyageKey, 'voyage-3.5', 'document'),
      (texts) => embedVoyage(texts, voyageKey, 'voyage-3.5', 'query')
    );
    results.push(result);
  }

  printResults(results);
}

main().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
