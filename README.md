What is auto-version-switch?
============================
This module enables you to automatically deploy a new version of a node app without restarting the node process.
It does this by forking the node app (using node's `cluster` module), checking the version, and reforking if necessary.
This module ensures no loss of connectivity because it will run a new version of the app before killing the previous version.

auto-version-switch also supports running under [IISNode](https://github.com/tjanczuk/iisnode).
This special mode exists because a node app running under iisnode does not support clustering,
and thus needs another mechanism to support version switching. See below for instructions on enabling iisnode.

How do I enable it in my app?
=============================
Let's say you have a JavaScript file, `app.js`, that runs a web server:

```javascript
var http = require('http');

http.createServer(function (req, res) {
    res.writeHead(200);
    res.end("Hello, world v1")
}).listen(process.env.PORT);
```

Executing `node app.js` runs the web server, but in production, you would want to keep multiple versions of the app in
different folders and switch between them as needed. For example, you would set up a folder structure like this:

```
v1/
    app.js
v2/
    app.js
version.txt
...
```

where `version.txt` holds the version number that needs to be running. 

With `auto-version-switch`, a change in `version.txt` automatically makes the correct version of `app.js` run, without any need for restarting the app, and without any loss of connectivity. It enables this by adding a small .js file that runs (and re-runs) the correct version of the app, ensuring that no loss of connectivity ensues due to the version switch.

For the above example, you just need to create another JavaScript file, `runner.js`, with the following code:

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

This example can be found in the `demo` folder of the module. Follow these steps to run the demo:

1. Execute `npm run demo`.
2. Browse to http://localhost:300 and view "Hello, world v1".
3. Change `version.txt` in the `demo` folder to be "v2".
4. Browse to http://localhost:300 and view "Hello, world v2". You may need to refresh two or three times before seeing the version change. Remember, no loss of connectivity means that the old app may be running a little while longer.


Reference
=========

The module is a single function, which accepts two functions (some would call them _strategies_):

* `run(version, switchVersionIfNeededFunc, [options])`: a function that runs your application.
* `fetchExpectedVersion(callback)`: a function that returns the version identifier that is expected to run.

### `run(version, switchVersionIfNeededFunc, [options])`
This function, which you supply, should run the app. It accepts two parameters:
* `version`. The version that should run.
* `switchVersionIfNeededFunc(callback)`. Your app should call this function from time to time to check whether the version has changed.
  It will switch versions of the app if it finds that the current version of the app
  is different than the version it gets by calling `fetchExpectedVersion`. If it isn't, it
  calls the callback to continue running your app. If the expected and current versions are different, it will initiate
  the procedure that switches the app. In this case, it will still call the callback to ensure that the current
  request is being handled. If there was an error, the callback
  will be called with an error; otherwise, it will be called with undefined. Even if the function returned an
  error, you can continue with your app, because it may be a temporary failure.
* `options`. An object of options. The options supported:
  * `iisNodeMode`. If `true`, will assume it is running under iisNode and use the iisNode mechanism for auto-version-switching.

### `fetchExpectedVersion(callback)`
This function, which you supply, should call the callback with the expected version. This uses the standard node callback signature:
* `callback(err, version)`. Where `err` is the error (or falsy if there is no error) and `version` is the version returned. Note
that the version can be any primitive type (`string`, `int`, etc.), as it is compared using `!===` against version values
returned by previous calls to this function.


IISNode Mode
============
To enable IISNode mode, you need to enable recycle signalling in issnode by setting the `recycleSignaleEnabled` setting to true:
```xml
<configuration>
  <system.webServer>
    <iisnode recycleSignalEnabled="true" />
    <handlers>
      <add name="iisnode" path="server.js" verb="*" modules="iisnode" />
    </handlers>
  </system.webServer>
</configuration>
````

Then, in your code, use the regular code, but pass {iisNodeMode: true} in the options parameter:
 ```javascript
require('auto-version-switch')(run, fetchExpectedVersion, {iisNodeMode: true});
...
```
