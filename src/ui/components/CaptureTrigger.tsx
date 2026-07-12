import { useEffect, useState, useRef } from 'preact/hooks';
import styled from '@emotion/styled';
import { theme } from '../theme';

interface CaptureTriggerProps {
  onTrigger: (excerpt: string) => void;
  shadowHost: HTMLElement;
}

export function CaptureTrigger({ onTrigger, shadowHost }: CaptureTriggerProps) {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [selectionText, setSelectionText] = useState('');
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleMouseUp = (e: MouseEvent) => {
      // Ignore clicks inside our own shadow host
      if (shadowHost.contains(e.target as Node)) {
        return;
      }

      // Small delay to let the browser finalize selection
      setTimeout(() => {
        const selection = window.getSelection();
        if (!selection) return;

        const text = selection.toString().trim();
        if (!text) {
          setPosition(null);
          setSelectionText('');
          return;
        }

        // Check if selection is inside an input or textarea
        const activeEl = document.activeElement;
        if (
          activeEl &&
          (activeEl.tagName === 'INPUT' ||
            activeEl.tagName === 'TEXTAREA' ||
            (activeEl as HTMLElement).isContentEditable)
        ) {
          setPosition(null);
          setSelectionText('');
          return;
        }

        try {
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();

          // Calculate absolute position on the viewport
          // Place button centered above the selection
          const x = rect.left + rect.width / 2;
          const y = rect.top + window.scrollY - 40;

          setPosition({ x, y });
          setSelectionText(text);
        } catch (err) {
          // Range might be invalid
          setPosition(null);
          setSelectionText('');
        }
      }, 50);
    };

    const handleMouseDown = (e: MouseEvent) => {
      // Clicking our button should not close the trigger immediately
      if (buttonRef.current?.contains(e.target as Node)) {
        return;
      }
      setPosition(null);
    };

    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mousedown', handleMouseDown);

    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [shadowHost]);

  if (!position) return null;

  return (
    <FloatingButton
      ref={buttonRef}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
      onClick={(e: MouseEvent) => {
        e.stopPropagation();
        onTrigger(selectionText);
        setPosition(null);
        // Clear window selection
        window.getSelection()?.removeAllRanges();
      }}
    >
      <GleamIcon viewBox="0 0 24 24">
        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
      </GleamIcon>
      <span>拾光</span>
    </FloatingButton>
  );
}

const FloatingButton = styled.button`
  position: fixed;
  transform: translate(-50%, -100%);
  display: flex;
  align-items: center;
  gap: 6px;
  background: ${theme.colors.bg.glass};
  border: 1px solid ${theme.colors.border.light};
  border-radius: 20px;
  padding: 8px 14px;
  color: ${theme.colors.text.primary};
  font-family: ${theme.typography.fontFamily};
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  box-shadow: ${theme.shadows.glow};
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  z-index: 2147483647;
  transition: ${theme.animations.spring};
  animation: floatIn 0.2s ease-out;

  &:hover {
    border-color: ${theme.colors.border.focus};
    transform: translate(-50%, -100%) scale(1.05);
    background: ${theme.colors.bg.base};
    box-shadow: 0 0 15px ${theme.colors.brand.glow};
  }

  @keyframes floatIn {
    from {
      opacity: 0;
      transform: translate(-50%, -90%) scale(0.9);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -100%) scale(1);
    }
  }
`;

const GleamIcon = styled.svg`
  width: 14px;
  height: 14px;
  fill: ${theme.colors.text.accent};
  filter: drop-shadow(0 0 3px ${theme.colors.brand.primary});
`;
