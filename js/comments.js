/**
 * We lazily show comments if the user requests them, since Disqus is very
 * heavy.
 */
export function revealComments() {
  /// Get the box that contains the comments,
  const el = document.getElementById('comments-container');
  /// And the button that the user can press to reveal them
  const button = el.querySelector('.comments-reveal-button');
  // Remove the button, since we are now showing the comments
  if (button) {
    el.removeChild(button);
  }
  // Instantiate the template that contains the Disqus comments and place it
  // in the comment container
  const tmpl = document.getElementById('disqus-tmpl');
  if (tmpl) {
    const clone = document.importNode(tmpl.content, true);
    el.appendChild(clone);
  }
}
