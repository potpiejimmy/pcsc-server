var express = require('express');
var app = express();
var expressWs = require('express-ws')(app);

var pcsc = require('./pcsc-emv');
var Notifier = require('./notifier');

var notifier = new Notifier();

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

app.listen(3004, function () {
  console.log('Startup complete. Listening on port 3004.');
});

pcsc.registerReader(
    function() {
        global.cardStatus = "IN";
        expressWs.getWss().clients.forEach(function(client) {
            client.send(JSON.stringify({"cardstatus":global.cardStatus, "severity":"success", "summary":"Status", "detail":"Card inserted."}));
        });
    },
    function() {
        global.cardStatus = "OUT";
        expressWs.getWss().clients.forEach(function(client) {
            client.send(JSON.stringify({"cardstatus":global.cardStatus, "severity":"warn", "summary":"Status", "detail":"Card removed."}));
        });
    }
);

/**
 * This websocket endpoint notifies about card insertion and removal
 */
app.ws('/status', (ws, req) => {
    console.log('Websocket connected.');
    // Note: All open websockets contained in expressWs.getWss().clients.
    ws.send(JSON.stringify({"cardstatus":global.cardStatus}));
});

/**
 * Reads some basic card data
 */
app.get('/card', (req, res) => {
    console.log('GET CARD');
    if (!pcsc.getReader()) res.send({"severity":"error", "summary":"Error", "detail":"Card reader not connected."});
    else {
        // if not reading already, start reading of card:
        if (!notifier.getObservers('card')) {
            // WINDOWS PLATFORM ONLY, ADD ARTIFICIAL DELAY OF 0.75s
            setTimeout(function() {
            pcsc.readMaestro().then(tag57 => {
                notifier.notifyObservers('card', tag57);
            }).catch(err => { console.log(err); notifier.notifyObservers('card', err);});
            // WINDOWS PLATFORM ONLY, ADD ARTIFICIAL DELAY OF 0.75s
            }, 750);
        }

        // add observer for card reading result
        notifier.addObserver('card', function(tag57) {
            if (tag57 && tag57.value) {
                res.send({
                    routingcode:  tag57.value.substr(3,5),
                    branch:       tag57.value.substr(5,3),
                    account:      tag57.value.substr(8,10),
                    shortaccount: tag57.value.substr(9,7),
                    subaccount:   tag57.value.substr(16,2),
                });
            } else {
                res.send({});
            }
        });
    }
});

/**
 * Creates a ChipTAN
 */
app.get('/tan', (req, res) => {
    console.log('CREATE TAN, flickercode=' + req.query.flickercode);
    if (!pcsc.getReader()) res.send({"severity":"error", "summary":"Error", "detail":"Card reader not connected."});
    else {
        // if not creating TAN already, start creating TAN
        if (!notifier.getObservers('tan')) {
            pcsc.createTAN(req.query.flickercode ? req.query.flickercode : "11048816650405262080595614312C303009")
            .then(tan => notifier.notifyObservers('tan', tan))
            .catch(err => { console.log(err); notifier.notifyObservers('tan', err); });
        }

        // add observer for TAN creation
        notifier.addObserver('tan', tan => res.send({tan:tan}));
    }
});

// --- for testing

app.get('/test', function(req, res) {
    expressWs.getWss().clients.forEach(function(client) {
        client.send(JSON.stringify({"severity":"warn", "summary":"Status", "detail":"Testing the websocket."}));
    });
    res.send('Status sent.');
});