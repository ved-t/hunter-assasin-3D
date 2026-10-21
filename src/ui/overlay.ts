// Full-screen DOM message overlay (rotate prompt, context loss, fatal errors).

export interface Overlay {
  readonly element: HTMLDivElement;
  show(): void;
  hide(): void;
  readonly visible: boolean;
}

export function createOverlay(root: HTMLElement, className: string, html: string): Overlay {
  const element = document.createElement('div');
  element.className = `overlay ${className}`;
  element.innerHTML = html;
  element.hidden = true;
  root.appendChild(element);
  return {
    element,
    show: () => (element.hidden = false),
    hide: () => (element.hidden = true),
    get visible() {
      return !element.hidden;
    },
  };
}
