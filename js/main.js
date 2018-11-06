import { revealComments } from "./comments.js";

document.revealComments = revealComments;

function waitFinished(what) {
  return new Promise(resolve => {
    what.addEventListener('finish', () => {
      resolve();
    });
  });
}

class SmartContentManager {
  /**
   * Create a manager for the given element's content
   * @param {HTMLElement} element The element that defines the main page content
   */
  constructor(element) {
    this.element = element;
    element.style.position = 'relative';
    this.content = this.querySelector('[content]');
    this.clipper = this.querySelector('[clipper]');
    this.backdrop = this.querySelector('[backdrop]');
    this.holder = this.querySelector('[holder]');
    this.prevLocation = location.pathname;
    this.previousNavigation = Promise.resolve(null);
    this.haveWebAnimations = !!this.content.animate;
  }

  /**
   * run querySelector on the associated element
   * @param {String} sel The CSS selector
   * @returns {HTMLElement}
   */
  querySelector(sel) {
    return this.element.querySelector(sel);
  }

  setup() {
    window.addEventListener('popstate', () => this._locationChanged());
    this._bindLinks();
  }

  /**
   * Hook into the given link to do magic
   * @param {HTMLAnchorElement} link The link element to steal bind events for
   */
  _bindLink(link) {
    link._eventsStolen = true;
    function preload() {
      if (link._preloaded) {
        // Already preloaded this one
        return;
      }
      console.log('Pre-loading contents for', link.href);
      link._preloaded = true;
      const preloadElement = document.createElement('link');
      preloadElement.rel = 'prefetch';
      preloadElement.href = link.href;
      document.head.appendChild(preloadElement);
    }
    link.addEventListener('touchstart', preload);
    link.addEventListener('mouseover', preload);
    // Override link handling ourselves
    link.addEventListener('click', e => {
      // Stop regular navigation from occuring
      e.preventDefault();
      // Push the state and swap out our page content
      history.pushState(null, null, link.href); // Update document.title at a later time
      this._locationChanged();
    });
  }

  _bindLinks() {
    for (const el of document.querySelectorAll('a')) {
      if (el._eventsStolen || !el.href.startsWith(location.origin) || /^\/(docs\/|feed.xml)/.test(el.pathname)) {
        continue;
      }
      this._bindLink(el);
    }
  }

  _locationChanged() {
    return this.previousNavigation = this.previousNavigation.then(async () => {
      if (location.pathname === this.prevLocation) {
        // Didn't actually change location. Probably a hash or query change
        return;
      }
      this.prevLocation = location.pathname;
      // Start to remove the old content, but don't block on it
      let animOutPromise = Promise.resolve(null);
      if (this.haveWebAnimations) {
        const anim = this.content.animate([
          {
            opacity: 1.0,
            transform: 'translateX(0)',
          },
          {
            opacity: 0,
            transform: 'translateX(-30px)',
          }
        ], {
            duration: 300,
            easing: 'ease-in-out',
          });
        animOutPromise = waitFinished(anim);
      }
      // When the animation finishes, remove the content node
      const removeOldPromise = animOutPromise.then(() => {
        this.element.classList.toggle('loading', true);
        this.content.remove();
      });
      // Load the new content
      const newDoc = await this._loadDocument(location.href);
      // Import and append the node to our tree
      const newContent = newDoc.importNode(newDoc.querySelector('[vb-content]'), true);
      this.holder.appendChild(newContent);
      // Update our new height. Use the `override-img-styles` class to prevent content from jumping around
      newContent.classList.toggle('override-img-styles', true);
      const oldHeight = this.element.offsetHeight;
      const newHeight = newContent.offsetHeight;
      this.element.style.height = `${newHeight}px`;
      this.clipper.style.height = `${newHeight}px`;
      newContent.classList.toggle('override-img-styles', false);
      if (this.haveWebAnimations) {
        // Animate the resize. Don't block.
        this.clipper.animate([
          { height: `${oldHeight}px` },
          { height: `${newHeight}px` },
        ], {
            duration: 300,
          });
        // Animate the content in from the right, if applicable. This time, _do_
        // wait for the animation to finish (we have no more work to do until these
        // animations finish)
        await waitFinished(newContent.animate([
          {
            opacity: 0,
            transform: 'translateX(30px)',
          },
          {
            opacity: 1.0,
            transform: 'translateX(0)',
          },
        ], {
            duration: 300,
            easing: 'ease-in-out',
          }));
      }
      // Wait until the content has slid to the side and been removed
      await removeOldPromise;
      // We're done loading the new page
      this.element.classList.toggle('loading', false);
      this.content = newContent;
      this.clipper.appendChild(this.content);
      this.element.style.height = null;
      this.clipper.style.height = null;
      // Update our document title
      document.title = newDoc.title;
      // Bind the new links on the new page
      this._bindLinks();
    });
  }

  async _loadDocument(href) {
    console.log('Fetching document from', href);
    const res = await fetch(href);
    const data = await res.text();
    const parser = new DOMParser();
    console.log('Parsing document contents');
    return parser.parseFromString(data, 'text/html');
  }

  _animateOut() {
    if (!this.haveWebAnimations) {
      console.warn('This browser does not support web animation APIs. We can make due.');
      return Promise.resolve(null);
    }

    return waitFinished(anim);
  }
};

const area = document.getElementById('smart-content-area');

const man = window._AreaManager = new SmartContentManager(area);
man.setup();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistration().then(async reg => {
    if (!reg) {
      console.log('No service worker was registered. Nothing to do.');
      return;
    }
    console.log('Stale service worker found. Unregistering...');
    const didUnregister = await reg.unregister();
    if (didUnregister) {
      console.log('Service worker was unregistered');
    } else {
      console.log('Failed to unregister our service worker. Huh?');
    }
  });
}

console.log('JavaScript was loaded successfully.');
