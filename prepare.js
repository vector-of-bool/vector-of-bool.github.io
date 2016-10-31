Polymer = {
  lazyRegister: true
};

function revealComments() {
  var el = document.getElementById('comments-container');
  const but = el.querySelector('.comments-reveal-button');
  if (but) {
    el.removeChild(but);
  }
  const tmpl = document.getElementById('disqus-tmpl');
  if (tmpl) {
    const clone = document.importNode(tmpl.content, true);
    el.appendChild(clone);
  }
}

(function() {
  const haveWebComponents =
      ('registerElement' in document &&
       'import' in document.createElement('link') &&
       'content' in document.createElement('template'));

  if (!haveWebComponents) {
    const script = document.createElement('script');
    script.defer = true;
    script.async = true;
    script.src = '/bower_components/webcomponentsjs/webcomponents-lite.min.js';
    document.head.appendChild(script);
  }

  const link = document.createElement('link');
  link.rel = 'import';
  link.href = '/bower_components/polymer/polymer.html';
  link.onload = function() {
    const link = document.createElement('link');
    link.rel = 'import';
    link.href = 'elements.html';
    link.async = true;
    document.head.appendChild(link);
  };
  document.head.appendChild(link);
})();

setTimeout(() => {
  const req = fetch('network-test.html');
  const timer =
      new Promise(resolve => { setInterval(() => resolve('timeout'), 3000); });
  function showOffline() {
    document.getElementById('toast').show({
      text: 'Unable to connect. Browsing offline.',
      duration: 5000,
    });
    document.body.classList.remove('online');
  };
  Promise.race([req, timer])
      .then(res => {
        if (res === 'timeout') {
          showOffline();
        } else {
          console.log(res);
        }
      })
      .catch(exc => {
        console.error('Request failed', exc);
        showOffline();
      });
}, 3000);