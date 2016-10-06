# pcsc-server
An express.js based server for remotely accessing a smartcard reader

Installation:

    npm install

Note: Uses node-pcsclite, see [here](https://github.com/santigimeno/node-pcsclite) for detailed information.

Start:

    npm start

## Sample API

    WEBSOCKET ws://localhost:3004/status
    
Broadcasting websocket for card insertion and removal notifications.

    GET http://localhost:3004/card
    
Reads and returns some sample data from EMV Tag 57 of the current card (Maestro only for now).
