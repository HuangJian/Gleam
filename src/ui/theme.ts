export const theme = {
  colors: {
    bg: {
      base: 'hsl(45, 40%, 97%)', // Warm paper white
      card: 'rgba(255, 253, 248, 0.95)', // Soft cream
      input: 'hsl(45, 30%, 99%)', // Almost white with warmth
      glass: 'rgba(255, 252, 245, 0.85)', // Warm translucent
    },
    border: {
      light: 'rgba(200, 180, 140, 0.25)', // Warm gray
      focus: 'hsl(38, 85%, 50%)', // Deep gold
      card: 'rgba(200, 180, 140, 0.15)',
    },
    text: {
      primary: 'hsl(35, 25%, 20%)', // Warm dark brown
      secondary: 'hsl(35, 15%, 45%)', // Medium warm gray
      muted: 'hsl(35, 12%, 60%)', // Light warm gray
      accent: 'hsl(30, 80%, 45%)', // Amber gold
      success: 'hsl(145, 60%, 40%)',
    },
    brand: {
      primary: 'hsl(38, 85%, 48%)', // Gleam Amber Gold
      primaryHover: 'hsl(38, 90%, 42%)', // Deeper gold
      glow: 'rgba(218, 165, 80, 0.25)', // Warm amber glow
    },
    // Source reference styling — deliberately neutral (NOT the gold brand used
    // for a user's own blockquote in their thought) so the two are never
    // confused. See SourceExcerpt component.
    reference: {
      border: 'hsl(35, 8%, 68%)', // Neutral warm gray, distinct from gold
      bg: 'rgba(120, 110, 95, 0.05)', // Subtle neutral wash
      caption: 'hsl(35, 10%, 50%)', // Muted label
      text: 'hsl(35, 12%, 40%)', // Readable secondary
    },
  },
  typography: {
    fontFamily:
      '"Outfit", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  shadows: {
    glow: '0 0 20px rgba(218, 165, 80, 0.3)',
    card: '0 4px 24px rgba(120, 100, 60, 0.12)',
    popover: '0 8px 40px rgba(120, 100, 60, 0.15)',
  },
  animations: {
    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
    spring: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
  },
}
