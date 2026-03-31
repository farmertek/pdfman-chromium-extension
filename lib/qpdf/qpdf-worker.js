/* eslint-env worker */
/* global FS */

var scriptURL = self.location.href;
var basePath = scriptURL.substring(0, scriptURL.lastIndexOf('/') + 1);

function emitError(message) {
  try {
    postMessage({
      type: 'error',
      message: message
    });
  } catch (e) { /* cannot communicate */ }
}

try {
  postMessage({ type: 'worker-started' });
} catch (e) { /* worker port not ready */ }

self.addEventListener('error', function (e) {
  var msg = (e && e.message)
    ? e.message
    : (e && e.filename ? ('Error in ' + e.filename + ':' + e.lineno) : 'unknown worker error');
  emitError(msg);
  if (e && e.preventDefault) e.preventDefault();
});

self.addEventListener('unhandledrejection', function (e) {
  var reason = e && e.reason;
  emitError('Unhandled rejection: ' + (reason && reason.message ? reason.message : String(reason)));
});

function stdout (txt) {
  postMessage({
    type: 'stdout',
    line: txt
  });
}

var Module = {
  noInitialRun: true,
  // 'noFSInit' : true
  printErr: stdout,
  print: stdout
};

var runtimeReady = false;
try {
  importScripts(basePath + 'lib/qpdf.js');
  runtimeReady = true;
} catch (e) {
  emitError('Failed to load qpdf runtime: ' + (e && e.message ? e.message : String(e)));
}

function getFileData (fileName) {
  if (typeof FS === 'undefined' || !FS.root || !FS.root.contents) {
    return null;
  }
  var file = FS.root.contents[fileName];
  if (!file) { return null; }
  return file.contents;
  // return new Uint8Array(file.contents).buffer;
}

onmessage = function (event) {
  var message = event.data;

  if (!runtimeReady) {
    emitError('QPDF runtime is not ready');
    return;
  }

  switch (message.type) {
    case 'save': {
      try {
        const filename = message.filename;
        const arrayBuffer = message.arrayBuffer;
        const data = ArrayBuffer.isView(arrayBuffer) ? arrayBuffer : new Uint8Array(arrayBuffer);
        stdout('saving ' + filename + ' (' + data.byteLength + ')');
        if (FS.analyzePath(filename).exists) {
          FS.unlink(filename);
        }
        FS.createDataFile('/', filename, data, true, false);
        postMessage({
          type: 'saved',
          filename
        });
      } catch (e) {
        emitError('save failed: ' + (e && e.message ? e.message : String(e)));
      }
      break;
    }

    case 'load': {
      try {
        const filename = message.filename;
        stdout('loading ' + filename);
        postMessage({
          type: 'loaded',
          filename,
          arrayBuffer: getFileData(filename)
        });
      } catch (e) {
        emitError('load failed: ' + (e && e.message ? e.message : String(e)));
      }
      break;
    }

    case 'execute': {
      const args = message.args;
      stdout('$ qpdf ' + args.join(' '));
      let exitStatus = -1;
      let execError = '';
      Module.onExit = function (status) {
        exitStatus = status;
      };
      try {
        Module.callMain(args);
      } catch (e) {
        execError = e && e.message ? e.message : String(e);
        if (exitStatus === -1) {
          exitStatus = 1;
        }
      }
      if (exitStatus === -1) {
        exitStatus = 0;
      }
      postMessage({
        type: 'executed',
        status: exitStatus,
        error: execError
      });
      break;
    }
  }
};

if (runtimeReady) {
  postMessage({
    type: 'ready'
  });
}
