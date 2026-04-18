/* eslint-env browser */

(function () {
// The QPDF Module
  function QPDF (options) {
    function isAbsoluteUrl(url) {
      return /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(url) || url.indexOf('//') === 0;
    }

    function ensureTrailingSlash(url) {
      return url && url.charAt(url.length - 1) !== '/' ? (url + '/') : url;
    }

    function resolveBasePath(explicitPath) {
      if (explicitPath) return ensureTrailingSlash(explicitPath);
      if (QPDF.path) return ensureTrailingSlash(QPDF.path);

      try {
        if (typeof document !== 'undefined') {
          if (document.currentScript && document.currentScript.src) {
            const src = document.currentScript.src;
            return src.substring(0, src.lastIndexOf('/') + 1);
          }

          const scripts = document.getElementsByTagName('script');
          for (let i = scripts.length - 1; i >= 0; i--) {
            const src = scripts[i] && scripts[i].src ? scripts[i].src : '';
            if (/\/qpdf\.js(?:[?#].*)?$/.test(src)) {
              return src.substring(0, src.lastIndexOf('/') + 1);
            }
          }
        }
      } catch (e) { /* ignore */ }

      return 'lib/qpdf/';
    }

    const {
      logger = console.log.bind(console),
      ready,
      onError,
      path,
      keepAlive = false,
    } = options || {};

    const basePath = resolveBasePath(path);
    let workerUrl = basePath + 'qpdf-worker.js';

    try {
      if (!isAbsoluteUrl(workerUrl) && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
        workerUrl = chrome.runtime.getURL(workerUrl.replace(/^\/+/, ''));
      }
    } catch (e) { /* non-extension context */ }

    logger('[qpdf] creating worker from: ' + workerUrl);

    let worker;
    try {
      worker = new Worker(workerUrl);
    } catch (e) {
      const err = new Error('Failed to create QPDF Worker: ' + (e.message || String(e)));
      if (onError) onError(err);
      return;
    }

    let readyFired = false;
    let workerStarted = false;

    const listeners = {};
    let nListeners = 0;
    const reportFatalError = function (message) {
      const err = new Error(message);
      Object.keys(listeners).forEach(function (id) {
        callListener(id, err);
      });
      if (!readyFired && onError) {
        onError(err);
      }
    };

    const addListener = function (id, fn) {
      listeners[id] = fn;
      nListeners += 1;
    };
    const callListener = function (id, err, arg) {
      const fn = listeners[id];
      if (fn) {
        delete listeners[id];
        fn(err, arg);
      }
      nListeners -= 1;

      if (!keepAlive && nListeners === 0) {
        setTimeout(function () {
        // No new commands after 1 second?
        // Then we terminate the worker (unless keepAlive is true).
          if (worker !== null && nListeners === 0) {
            worker.terminate();
            worker = null;
          }
        }, 1000);
      }
    };

    const qpdf = {
      save (filename, arrayBuffer, callback) {
        if (!worker) {
          if (callback) return callback(new Error('worker terminated'));
          throw new Error('worker terminated');
        }
        if (callback) {
          addListener(filename, callback);
        }
        worker.postMessage({
          type: 'save',
          filename,
          arrayBuffer
        });
      },
      load (filename, callback) {
        if (!worker) {
          if (callback) return callback(new Error('worker terminated'));
          throw new Error('worker terminated');
        }
        if (callback) {
          addListener(filename, callback);
        }
        worker.postMessage({
          type: 'load',
          filename
        });
      },
      execute (args, callback) {
        if (!worker) {
          if (callback) return callback(new Error('worker terminated'));
          throw new Error('worker terminated');
        }
        if (callback) {
          addListener('execute', callback);
        }
        worker.postMessage({
          type: 'execute',
          args
        });
      },
      terminate () {
        if (worker) {
          worker.terminate();
          worker = null;
        }
      }
    };

    worker.onerror = function (event) {
      let msg;
      if (event && event.message) {
        msg = event.message;
      } else if (event && event.filename) {
        msg = 'Error in ' + event.filename + ':' + event.lineno;
      } else {
        msg = workerStarted
          ? 'Worker crashed after startup'
          : 'Worker script failed to load or parse (script never started)';
        if (event && event.type) msg += ' [event.type=' + event.type + ']';
      }
      if (event && event.preventDefault) event.preventDefault();
      reportFatalError(msg);
    };

    worker.onmessageerror = function () {
      reportFatalError('Worker message could not be deserialized');
    };

    worker.onmessage = function (event) {
      const message = event.data;

      switch (message.type) {
        case 'worker-started': {
          workerStarted = true;
          logger('[qpdf] worker script started');
          break;
        }

        case 'ready': {
          logger('[qpdf] ready');
          readyFired = true;
          if (ready) {
            ready(qpdf);
          }
          break;
        }

        case 'stdout':
          logger('[qpdf.worker] ' + message.line);
          break;

        case 'saved': {
          const filename = message.filename;
          logger('[qpdf] ' + filename + ' saved');
          callListener(filename, null);
          break;
        }

        case 'loaded': {
          const { filename, arrayBuffer } = message;
          const size = arrayBuffer ? arrayBuffer.length : 0;
          logger('[qpdf] ' + filename + ' loaded (' + size + ')');
          if (arrayBuffer) {
            callListener(filename, null, arrayBuffer);
          } else {
            callListener(filename, new Error('File not found'));
          }
          break;
        }

        case 'error': {
          reportFatalError(message.message || 'Unknown QPDF worker error');
          break;
        }

        case 'executed': {
          const { status, error } = message;
          logger('[qpdf] exited with status ' + status);
          if (status !== 0) {
            callListener('execute', new Error(error || ('QPDF exited with status ' + status)));
          } else {
            callListener('execute', null);
          }
          break;
        }
      }
    };
  }

  QPDF.encrypt = function ({
    logger,
    arrayBuffer,
    userPassword,
    ownerPassword,
    keyLength,
    callback
  }) {
    const safeCallback = function (err, arg) {
      if (callback) {
        if (err || arg) {
          callback(err, arg);
          callback = null;
        }
      }
    };
    QPDF({
      logger,
      ready: function (qpdf) {
        qpdf.save('input.pdf', arrayBuffer, safeCallback);
        qpdf.execute([
          '--encrypt',
          userPassword || '',
          ownerPassword || '',
          String(keyLength || 256),
          '--',
          'input.pdf',
          'output.pdf'
        ], safeCallback);
        qpdf.load('output.pdf', safeCallback);
      }
    });
  };

  QPDF.help = function (logger) {
    QPDF({
      logger,
      ready: function (qpdf) {
        qpdf.execute(['--help']);
      }
    });
  };

  QPDF.base64ToArrayBuffer = function (base64) {
    const binary = window.atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  };

  QPDF.arrayBufferToBase64 = function (buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  };

  window.QPDF = QPDF;
})();
