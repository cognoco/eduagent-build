interface Greeting {
  title: string;
  subtitle: string;
}

function getTitle(hour: number, name: string): string {
  const safeName = name.trim();

  if (hour >= 5 && hour < 12) {
    return safeName ? `Good morning, ${safeName}!` : 'Good morning!';
  }

  if (hour >= 12 && hour < 17) {
    return safeName ? `Good afternoon, ${safeName}!` : 'Good afternoon!';
  }

  if (hour >= 17 && hour < 21) {
    return safeName ? `Good evening, ${safeName}!` : 'Good evening!';
  }

  return safeName ? `Hey, ${safeName}!` : 'Hey!';
}

function getDefaultSubtitle(hour: number): string {
  if (hour >= 5 && hour < 12) {
    return 'Fresh mind, fresh start';
  }

  if (hour >= 12 && hour < 17) {
    return "Let's keep going";
  }

  if (hour >= 17 && hour < 21) {
    return 'Winding down or powering through?';
  }

  return 'Burning the midnight oil?';
}

export type TimeOfDay = 'morning' | 'afternoon' | 'evening';

export function getTimeOfDay(now: Date = new Date()): TimeOfDay {
  const hour = now.getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  return 'evening';
}

export function getGreeting(name: string, now: Date = new Date()): Greeting {
  const hour = now.getHours();
  const day = now.getDay();
  const title = getTitle(hour, name);

  if (day === 1) {
    return { title, subtitle: 'Fresh week ahead!' };
  }

  if (day === 5) {
    return { title, subtitle: 'Happy Friday!' };
  }

  if (day === 0 || day === 6) {
    return { title, subtitle: 'Weekend learning? Nice!' };
  }

  return {
    title,
    subtitle: getDefaultSubtitle(hour),
  };
}
