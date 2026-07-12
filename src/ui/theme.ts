export const theme = {
  colors: {
    bg: {
      base: 'hsl(224, 25%, 10%)',
      card: 'rgba(28, 33, 48, 0.8)',
      input: 'hsl(224, 22%, 14%)',
      glass: 'rgba(16, 20, 30, 0.75)',
    },
    border: {
      light: 'rgba(255, 255, 255, 0.08)',
      focus: 'hsl(38, 92%, 60%)',
      card: 'rgba(255, 255, 255, 0.05)',
    },
    text: {
      primary: 'hsl(210, 20%, 98%)',
      secondary: 'hsl(210, 15%, 75%)',
      muted: 'hsl(210, 10%, 55%)',
      accent: 'hsl(38, 92%, 60%)', // Gleam gold
      success: 'hsl(145, 80%, 65%)',
    },
    brand: {
      primary: 'hsl(38, 92%, 55%)',     // Gleam Warm Gold
      primaryHover: 'hsl(38, 95%, 65%)',
      glow: 'rgba(253, 186, 116, 0.15)',
    }
  },
  typography: {
    fontFamily: '"Outfit", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  shadows: {
    glow: '0 0 20px rgba(253, 186, 116, 0.25)',
    card: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
    popover: '0 12px 48px rgba(0, 0, 0, 0.5)',
  },
  animations: {
    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
    spring: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
  }
};
