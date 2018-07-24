# pcsc-server
An express.js based server for remotely accessing a smartcard reader

Installation:

    npm install

Note: Uses node-pcsclite, see [here](https://github.com/santigimeno/node-pcsclite) for detailed information.

Windows:

For npm install to succeeed on Windows, you need to install windows-build-tools globally prior to running npm install:

    npm install -g --production windows-build-tools

If build still fails with 'The imported project "C:\Microsoft.Cpp.Default.props" was not found.', set the VCTargetsPath environment variable, for instance (check where Microsoft.Cpp.Default.props resides):

    SET VCTargetsPath=C:\Program Files (x86)\MSBuild\Microsoft.Cpp\v4.0\v140

Start:

    npm start

## Sample API

    WEBSOCKET ws://localhost:3004/status
    
Broadcasting websocket for card insertion and removal notifications.

    GET http://localhost:3004/card
    
Reads and returns some sample data from EMV Tag 57 of the current card (Maestro only for now).
