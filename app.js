var pcsc = require('./pcsc-emv');
var fs = require('fs');
var request = require('request');

var currentAppId;

pcsc.registerReader(
    function() {
        console.log("Card inserted.");
        pcsc.readMaestro().then(tag57 => {
            var accountno = tag57.value.substr(8,10);
            console.log("Got Account No " + accountno);
            var customers = JSON.parse(fs.readFileSync('customermap.json', 'utf8'));
            currentAppId = customers[accountno].appId;
            var url = "http://localhost:8888/start/" + currentAppId + "/" + customers[accountno].bankingId + "/" + customers[accountno].name;
            console.log("Requesting " + url);
            request(url, function (error, response, body) {
                console.log('body:', body);
            });
        });
    },
    function() {
        console.log("Card removed.");
        var url = "http://localhost:8888/stop/" + currentAppId;
        console.log("Requesting " + url);
        request(url, function (error, response, body) {
            console.log('body:', body);
        });
    }
);
