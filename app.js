var express = require('express');
var pcsclite = require('pcsclite');
var Notifier = require('./notifier');

var app = express();
var pcsc = pcsclite();

var reader;
var notifier = new Notifier();

app.listen(3004, function () {
  console.log('Startup complete. Listening on port 3004.');
});

pcsc.on('reader', function(r) { 
    console.log('New reader detected', r.name);
    reader = r;

    r.on('status', function(status) {
        var changes = this.state ^ status.state;
        if (changes) {
            if ((changes & this.SCARD_STATE_EMPTY) && (status.state & this.SCARD_STATE_EMPTY)) {
                console.log("card removed"); /* card removed */
                reader.disconnect(reader.SCARD_LEAVE_CARD, function(err) {});
            } else if ((changes & this.SCARD_STATE_PRESENT) && (status.state & this.SCARD_STATE_PRESENT)) {
                console.log("card inserted"); /* card inserted */
                reader.connect({ share_mode : this.SCARD_SHARE_SHARED }, function(err, protocol) {
                    if (err) console.log(err); 
                    else readData(protocol);
                });
            }
        }
    });
});

app.get('/', function(req, res) {
    if (!reader) {
        res.send("Reader not connected.");
    } else {
        notifier.addObserver('status', function(arg) {
            res.send(arg);
        });
    }
});

function sendAndReceive(protocol, data, callback) {
    reader.transmit(new Buffer(data,'hex'), 40, protocol, function(err, data) {
        if (err) {
            console.log(err);
        } else {
            console.log('Data received', data);
            callback(data);
        }
    });
}

function readData(protocol) {
    console.log('Protocol(', reader.name, '):', protocol);
    // SELECT AID MAESTRO: '00A4040007A000000004306000'
    sendAndReceive(protocol, '00A4040007A000000004306000', function(data) {
        // GET_PROCESSING_OPTIONS: '80A8000002830000'
        sendAndReceive(protocol, '80A8000006830408260826', function(data) {
            // READ_RECORD: '00B2020C00'
            sendAndReceive(protocol, '00B2010C00', function(data) {
                notifier.notifyObservers('status', data.toString('hex'));
            });
        });
    });
}