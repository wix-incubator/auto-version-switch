What is auto-version-switch?
============================
This module enables you to deploy a new version of a node app, and automatically make it deploy without restarting the node process.
It does this by forking the node app (using node's `cluster` module), checking the version, and reforking if necessary.
This module will ensure no loss of connectivity, as it will run new version of the app before killing the previous version.

How do I enable it in my app?
=============================
Let's say you have an app.js that runs a web server, e.g.

```javascript
var http = require('http');

http.createServer(function (req, res) {
    res.writeHead(200);
    res.end("Hello, world v1")
}).listen(process.env.PORT);
```

Doing `node app.js` runs the app nicely. But in production you would want to keep multiple versions of the app in
different folders, and switch between them as needed, e.g. a folder structure like this:

```
v1/
    app.js
v2/
    app.js
version.txt
...
```

Where `version.txt` holds the version number that needs to be running. What you would like is for a change in `version.txt`
to automatically make the correct version of app.js run, without any need for restarting the app, and without
any loss of connectivity.

`auto-version-switch` enables this scenario, along with others, by adding a small js file that runs (and re-runs) the
 correct version of the app, taking care that no loss of connectivity ensues due to the version switch.

 For the above example, you just need to create a `runner.js` with the following code:

 ```javascript
require('auto-version-switch')(run, fetchExpectedVersion);

function run(version, switchVersionIfNeededFunc) {
    require('./' + version + '/app.js').run(switchVersionIfNeededFunc);
}

function fetchExpectedVersion(callback) {
    var fs = require('fs');

    fs.readFile('version.txt', function (err, content) {
        if (err)
            callback(err);

        callback(null, content.toString().trim());
    });
}
 ```

And slightly modify `app.js` to use `switchVersionIfNeededFunc`:

```javascript
var http = require('http');

exports.run = function(version, switchVersionIfNeededFunc) {
    http.createServer(function (req, res) {
        switchVersionIfNeededFunc(function (err) {
            if (err)
                console.error(err);
            res.writeHead(200);
            res.end("Hello, world v1")
        });
    }).listen(process.env.PORT || 3000);
}

// optional - ensure app.js runs as a standalone module
if (require.main == module) {
    exports.run(function(callback) {
        process.nextTick(callback);
    });
}
```

This example can be found in the `demo` folder of the module, and can be run using `npm run demo`. Try running the demo,
using following these steps:

1. Run the demo using `npm run demo`.
2. Browse to http://localhost:300 and view the "Hello world v1".
3. Change `version.txt` in the demo folder to be "v2".
4. Browse to http://localhost:300 and view the "Hello world v2". It may not be immediate, as you may
need to refresh two or three times. Remember, no loss of connectivity means that the old app may be running
_a little_ while longer.


Reference
=========

The module is a single function, which accepts two functions (some would call them _strategies_):

* `run(version, switchVersionIfNeededFunc)`: a function you supply that runs your application.
* `fetchExpectedVersion(callback)`: a function you supply that returns the version identifier that is expected to run.

### `run(switchVersionIfNeededFunc, version)`
This function, which you supply, should run the app. It accepts two parameters:
* `version`. The version that should run.
* `switchVersionIfNeededFunc(callback)`. This function should be called by your app from time to time.
  It will switch versions of the app if it finds that the current version of the app
  is different than the version it gets by calling `fetchExpectedVersion`. If it isn't, it
  calls the callback to continue your app. If the expected and current versions are different, it will initiate
  the procedure that switches the app. Note that it will still call the callback in this case, to ensure that the current
  request is still handled. If there was an error, the callback
  will be called with an error, otherwise it will be called with undefined. Note that even if the function returned an
  error, you can continue with your app, as it may be a temporary failure.

### `fetchExpectedVersion(callback)`
This function, which you supply, should call the callback with the expected version. The callback signature
is the standard node callback signature:
* `callback(err, version)`. Where err is the error, or falsy if no error, and version is the version returned. Note
that the version can be of any primitive type (`string`, `int`) as it is compared (using `!===`) against version values
returned by previous calls to this function.
