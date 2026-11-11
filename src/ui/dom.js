// Two tiny helpers for building page elements.

// el('div', 'panel', 'Hello') or el('button', { class: 'tool', title: 'Road' }, [child, child])
export function el(tag, attributes = null, content = null) {
  const node = document.createElement(tag);
  if (typeof attributes === 'string') node.className = attributes;
  else if (attributes) {
    for (const [name, value] of Object.entries(attributes)) {
      if (name === 'class') node.className = value;
      else if (name === 'text') node.textContent = value;
      else node.setAttribute(name, value);
    }
  }
  if (typeof content === 'string') node.textContent = content;
  else if (Array.isArray(content)) node.append(...content.filter(Boolean));
  return node;
}

// Sets text only when it changed, so the page is not touched 60 times a second for nothing.
export function setText(node, text) {
  if (node.textContent !== text) node.textContent = text;
}
