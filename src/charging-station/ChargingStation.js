const Configuration = require('../utils/Configuration');
const WebSocket = require('ws');
const Constants = require('../utils/Constants');
const Utils = require('../utils/Utils');
const OCPPError = require('./OcppError');
const uuid = require('uuid/v4');
const AutomaticTransactionGenerator = require('./AutomaticTransactionGenerator');
const Statistics = require('../utils/Statistics');
const fs = require('fs');
const {performance, PerformanceObserver } = require('perf_hooks');

const _performanceObserver  = new PerformanceObserver((list) => {
        let entry = list.getEntries()[0];
        Utils.logPerformance(entry, 'ChargingStation');
        _performanceObserver.disconnect();
  });
class ChargingStation {
    constructor(index) {
        this._requests = {};
        this._isStarted = false;
        this._isSocketRestart = false;
        this._lastHeartBeat = null;
        this._stationInfo = this.buildChargingStation(index);
        this._index = index;
        this._messageQueue = [];
        this._bootNotificationMessage = {
            chargePointModel: this._stationInfo.chargePointModel,
            chargePointVendor: this._stationInfo.chargePointVendor
        }
        this._configuration = JSON.parse(JSON.stringify(Configuration.getChargingStationConfiguration()));
        this._authorizationFile = Configuration.getChargingStationAuthorizationFile();
        let supervisionUrl = JSON.parse(JSON.stringify(Configuration.getSupervisionURL()));
        let indexUrl = 0; 
        if (Array.isArray(supervisionUrl)) {
            if (Configuration.getEquallySupervisionDistribution()) {
                indexUrl = index % supervisionUrl.length;
            } else {
// Get a random url 
                indexUrl = Math.floor(Math.random() * supervisionUrl.length);
            }
            this._supervisionUrl = supervisionUrl[indexUrl];
        } else {
            this._supervisionUrl = supervisionUrl;
        }
        console.log(this._stationInfo.name + " will communicate with " + this._supervisionUrl + " index " + indexUrl);
    }

    buildChargingStation(index) {
        let templateStation = JSON.parse(JSON.stringify(Configuration.getChargingStationTemplate()));
        templateStation.maxPower = templateStation.power[Math.floor(Math.random() * templateStation.power.length)];
        templateStation.name = templateStation.baseName + '-' + ("000000000" + index).substr(("000000000" + index).length - 4);
        return templateStation;
    }

    async start() {
        this._url = this._supervisionUrl + "/" + this._stationInfo.name;
        this._wsConnection = new WebSocket(this._url, "ocpp1.6");
        if (this._authorizationFile !== "") {
            try {
                //load file
                const fileDescriptor = fs.openSync(this._authorizationFile, 'r');
                this._authorizedKeys = JSON.parse(fs.readFileSync(fileDescriptor, 'utf8'));
                fs.closeSync(fileDescriptor);
                // get remote authorization logic
                this._authorizeRemoteTxRequests = Configuration.getChargingStationConfiguration().configurationKey.find(configElement => {
                    configElement.key === "AuthorizeRemoteTxRequests"; 
                }).value;
                //  Monitor authorization file
                fs.watchFile(this._authorizationFile, (current, previous) => {
                    try {
                        //reload file
                        const fileDescriptor = fs.openSync(this._authorizationFile, 'r');
                        this._authorizedKeys = JSON.parse(fs.readFileSync(fileDescriptor, 'utf8'));
                        fs.closeSync(fileDescriptor);
                    } catch (error) {
                        console.log("Authorization file error" + error);
                    }
                })    
            } catch (error) {
                console.log("Authorization file error" + error);
            }
            
        }
        // Handle incoming messages
        this._wsConnection.on('message', this.onMessage.bind(this));
        // Handle Error on Socket
        this._wsConnection.on('error', this.onError.bind(this));
        // Handle Socket close
        this._wsConnection.on('close', this.onClose.bind(this));
        // Handle opening connection
        this._wsConnection.on('open', this.onOpen.bind(this));
    }

    onOpen() {
        console.log(`${this._stationInfo.name} is connected to server`);
        if (this._isSocketRestart) {
            this.basicStartMessageSequence();
            if (this._messageQueue.length > 0) {
                this._messageQueue.forEach(message => {
                    this._wsConnection.send(message);
                });
            }
        } else {
            //At first send Bootnotification
            try {
                this.sendMessage(uuid(), this._bootNotificationMessage, Constants.OCPP_JSON_CALL_MESSAGE, "BootNotification");
            } catch (error) {
                console.log("Send error:" + error);
            }
                
        }
        this._isSocketRestart = false;

    }

    onError(error) {
        this._isStarted = false;
        console.log("Socket ERROR " + error);
    }

    async onClose(code, reason) {
        this._isStarted = false;
        console.log("Socket Close" + code + " " + reason);
        this._isSocketRestart = true;
        while (!this._isStarted) {
            this.start();
            await Utils.sleep(10000);
        }
    }

    async onMessage(message) {
        // Parse the message
        let [messageType, messageId, commandName, commandPayload, errorDetails] = JSON.parse(message);

        // Initialize: done in the message as init could be lengthy and first message may be lost
        //    await this.initialize();
//        console.log("<< Message received " + JSON.stringify(message, null, " "));
        
        try {
            // Check the Type of message
            switch (messageType) {
                // Incoming Message
                case Constants.OCPP_JSON_CALL_MESSAGE:
                    // Process the call
                    Statistics.addMessage(commandName, this);
                    await this.handleRequest(messageId, commandName, commandPayload);
                    break;
                    // Outcome Message
                case Constants.OCPP_JSON_CALL_RESULT_MESSAGE:
                    // Respond
                    const [responseCallback] = this._requests[messageId];
                    if (!responseCallback) {
                        throw new Error(`Response for unknown message ${messageId}`);
                    }
                    let requestPayload = this._requests[messageId][2];
                    delete this._requests[messageId];
//                    Statistics.addMessage(commandName, this);
                    responseCallback(commandName, requestPayload);
                    break;
                    // Error Message
                case Constants.OCPP_JSON_CALL_ERROR_MESSAGE:
                    // Log
                    console.log(JSON.stringify(message, null, " "));
                    if (!this._requests[messageId]) {
                        throw new Error(`Error for unknown message ${messageId}`);
                    }
                    const [, rejectCallback] = this._requests[messageId];
                    delete this._requests[messageId];
                    rejectCallback(new OCPPError(commandName, commandPayload, errorDetails));
                    break;
                    // Error
                default:
                    throw new Error(`Wrong message type ${messageType}`);
            }
        } catch (error) {
            // Log
            console.log(error);
            // Send error
            //            await this.sendError(messageId, error);
        }
    }

    send(command, messageType = Constants.OCPP_JSON_CALL_MESSAGE) {
        // Send Message
        return this.sendMessage(uuid(), command, messageType);
    }

    sendError(messageId, err) {
        // Check exception: only OCPP error are accepted
        const error = (err instanceof OCPPError ? err : new OCPPError(Constants.OCPP_ERROR_INTERNAL_ERROR, err.message));
        // Send error
        return this.sendMessage(messageId, error, Constants.OCPP_JSON_CALL_ERROR_MESSAGE);
    }

    sendMessage(messageId, command, messageType = Constants.OCPP_JSON_CALL_RESULT_MESSAGE, commandName = "") {
        // send a message through webwsConnection
        const wsConnection = this._wsConnection;
        const self = this;
        // Create a promise
        return new Promise((resolve, reject) => {
            let messageToSend;
            // Type of message
            switch (messageType) {
                // Request
                case Constants.OCPP_JSON_CALL_MESSAGE:
                    Statistics.addMessage(commandName, this);
                    // Build request
                    this._requests[messageId] = [responseCallback, rejectCallback, command];
                    messageToSend = JSON.stringify([messageType, messageId, commandName, command]);
                    break;
                    // Response
                case Constants.OCPP_JSON_CALL_RESULT_MESSAGE:
                    // Build response
                    messageToSend = JSON.stringify([messageType, messageId, command]);
                    break;
                    // Error Message
                case Constants.OCPP_JSON_CALL_ERROR_MESSAGE:
                    // Build Message
                    const {
                        code,
                        message,
                        details
                    } = command;
                    Statistics.addMessage(`Error ${code}`, this);
                    messageToSend = JSON.stringify([messageType, messageId, code, message, details]);
                    break;
            }
            // Check if wsConnection in ready
            if (wsConnection.readyState === WebSocket.OPEN) {
                // Yes: Send Message
//                console.log(">> Message sent " + JSON.stringify(messageToSend, null, " "));
                wsConnection.send(messageToSend);
            } else {
// buffer messages until connection is back
                this._messageQueue.push(messageToSend);
            }
            // Request?
            if (messageType !== Constants.OCPP_JSON_CALL_MESSAGE) {
                // Yes: send Ok
                resolve();
            } else {
                if (wsConnection.readyState === WebSocket.OPEN) {
                    // Send timeout in cas econnection is open otherwise wait for ever
                    setTimeout(() => rejectCallback(`Timeout for message ${messageId}`), Constants.OCPP_SOCKET_TIMEOUT);
                }
            }

            // Function that will receive the request's response
            function responseCallback(payload, requestPayload) {
                Statistics.addMessage(commandName, this, true);
                let responseCallbackFn = "handleResponse" + commandName;
                if (typeof self[responseCallbackFn] === 'function') {
                    self[responseCallbackFn](payload, self, requestPayload);
                } else {}
                // Send the response
                resolve(payload);
            }

            // Function that will receive the request's rejection
            function rejectCallback(reason) {
                // Build Exception
                self._requests[messageId] = () => {};
                const error = reason instanceof OCPPError ? reason : new Error(reason);
                // Send error
                reject(error);
            }
        });
    }

    handleResponseBootNotification(payload, self) {
        if (payload.status === "Accepted") {
            this._isStarted = true;
            console.log("Heartbeat started every " + payload.interval + "s");
            this._heartbeatInterval = payload.interval * 1000;
            this.basicStartMessageSequence();
        }
        return;
    }

    async basicStartMessageSequence(){
        this.startHeartbeat(this, this._heartbeatInterval);
        if (!this._connectors) { //build connectors
            this._connectors = {};
            const connectorsConfig = JSON.parse(JSON.stringify(Configuration.getChargingStationConnectors()));
            //determine number of customized connectors
            let lastConnector;
            for (lastConnector in connectorsConfig) {
                if (lastConnector === 0 && this._stationInfo.usedConnectorId0) {
                    this._connectors[lastConnector] = connectorsConfig[lastConnector]; 
                }
            }
            let maxConnectors = 0;
            if (Array.isArray(this._stationInfo.numberOfConnectors)) {
                // generate some connectors
                maxConnectors = this._stationInfo.numberOfConnectors[( this._index - 1 ) % this._stationInfo.numberOfConnectors.length];
            } else {
                maxConnectors = this._stationInfo.numberOfConnectors;
            }
            // generate all connectors
            for (let index = 1; index <= maxConnectors; index++) {
                const randConnectorID = (this._stationInfo.randomConnectors ? Utils.getRandomInt(lastConnector, 1) : index);
                this._connectors[index] = connectorsConfig[randConnectorID];
            }
        } 
        
        for (let connector in this._connectors) {
            if (!this._connectors[connector].transactionStarted) {
                if (this._connectors[connector].bootStatus) {
                    setTimeout(() => this.sendStatusNotification(connector, this._connectors[connector].bootStatus), 500);
                } else {
                    setTimeout(() => this.sendStatusNotification(connector, "Available"), 500);
                }
            } else {
                setTimeout(() => this.sendStatusNotification(connector, "Charging"), 500);
            }
        };

        if (Configuration.getAutomaticTransactionConfiguration().enable && !this._automaticTransactionGeneration) {
            this._automaticTransactionGeneration = new AutomaticTransactionGenerator(this);
            this._automaticTransactionGeneration.start();
        }
    }

    handleResponseStartTransaction(payload, self, requestPayload) {
        this._connectors[requestPayload.connectorId] = {
            transactionStarted: false,
            idTag: requestPayload.idTag
        }
        if (payload.idTagInfo.status === "Accepted") {
            for (let connector in this._connectors) {
                if (connector == requestPayload.connectorId) {
                    this._connectors[connector].transactionStarted = true;
                    this._connectors[connector].transactionId = payload.transactionId;
                    console.log("Transaction " + this._connectors[connector].transactionId + " STARTED on " + this._stationInfo.name + "#" + requestPayload.connectorId);
                    this.sendStatusNotification(requestPayload.connectorId, "Charging");
                    this.startMeterValues(this, requestPayload.connectorId, Configuration.getMeterValueInterval());
                }
            };
            
        } else {
            console.log("Start transaction REJECTED " + payload.idTagInfo.status);
            this.sendStatusNotification(requestPayload.connectorId, "Available");
        }
        return;
    }

    async sendStatusNotification(connectorId, status, errorCode = "NoError") {
            try {
                let payload = { connectorId: connectorId, errorCode: errorCode, status: status};
                await this.sendMessage(uuid(), payload, Constants.OCPP_JSON_CALL_MESSAGE, "StatusNotification");
            } catch (error) {
            }
    }

    async startHeartbeat(self, interval) {
        if (!this._isStarted) return;
        const chargingStation = self;
        setInterval(() => {
            try {
                let payload = {
                    currentTime: new Date().toISOString()
                }
                chargingStation.sendMessage(uuid(), payload, Constants.OCPP_JSON_CALL_MESSAGE, "Heartbeat");
            } catch (error) {
                console.log("Send error:" + error);
            }
        }, interval);
    }

    async handleRequest(messageId, commandName, commandPayload) {
        let result;
        Statistics.addMessage(commandName, this, true);
        // Call
        if (typeof this["handle" + commandName] === 'function') {
            // Call the method
            result = await this["handle" + commandName](commandPayload);
        } else {
            // Throw Exception
            throw new Error(`${commandName} is not implemented`);
        }
        // Send Response
        await this.sendMessage(messageId, result, Constants.OCPP_JSON_CALL_RESULT_MESSAGE);
    }

    async handleGetConfiguration(commandPayload) {
//        console.log("GET CONFIGURATION " + JSON.stringify(this._configuration));
        return this._configuration;
    }

    async handleChangeConfiguration(commandPayload) {
        const keyToChange = this._configuration.configurationKey.find((element) => {
            return element.key === commandPayload.key;
        });
        if (keyToChange) {
//            console.log('CHANGE CONFIGURATION ' + commandPayload.key + ' to ' + commandPayload.value);
            keyToChange.value = commandPayload.value;
            return {
                status: "Accepted"
            }
        } else {
//            console.log('CHANGE CONFIGURATION ERROR ' + commandPayload.key + ' to ' + commandPayload.value);
            return {
                status: "Rejected"
            }
        }
    }

    async handleRemoteStartTransaction(commandPayload) {
        let transactionConnectorID = ( commandPayload.hasOwnProperty("connectorId") ? commandPayload.connectorId : "1" );
        if (this._authorizedKeys && this._authorizedKeys.length > 0 && this._authorizeRemoteTxRequests) {
            // check if authorized
            if (this._authorizedKeys.find((value) => value === commandPayload.idTag)) {
                // Authorization successful start transaction
                setTimeout( () => this.sendStartTransaction(transactionConnectorID, commandPayload.idTag), 500 );
                return {
                    status: "Accepted"
                };
            } else {
                // Start authorization checks
                return {
                    status: "Rejected"
                };
            }
        } else {
            // no local authorization check required => start transaction
            setTimeout( () => this.sendStartTransaction(transactionConnectorID, commandPayload.idTag), 500 );
            return {
                status: "Accepted"
            };
        }  
    }

    async sendStartTransaction(connectorID, idTag) {
        try {
            let payload = { connectorId: connectorID, idTag: idTag, meterStart: 0, timestamp: new Date().toISOString() };
            await this.sendMessage(uuid(), payload, Constants.OCPP_JSON_CALL_MESSAGE, "StartTransaction");
        } catch (error) {
            throw error;
        }
    }

    async sendStopTransaction(transactionId, connectorID) {
        try {
            let payload = { transactionId: transactionId, meterStop: 0, timestamp: new Date().toISOString() };
            await this.sendMessage(uuid(), payload, Constants.OCPP_JSON_CALL_MESSAGE, "StopTransaction");
            console.log("Transaction " + this._connectors[connectorID].transactionId + " STOPPED on " + this._stationInfo.name + "#" + connectorID);
            this._connectors[connectorID].transactionStarted = false;
            this._connectors[connectorID].transactionId = null;
            clearInterval(this._connectors[connectorID].transactionInterval);
            this.sendStatusNotification(connectorID, "Available");
        } catch (error) {
            throw error;
        }
    }

    async sendMeterValues(self, connectorID, interval) {
        try {
            let sampledValueLcl = {
                timestamp: new Date().toISOString(),
            };
            let meterValuesClone = JSON.parse(JSON.stringify(Configuration.getChargingStationConnector(connectorID).MeterValues));
            if (Array.isArray(meterValuesClone)) {
                sampledValueLcl.sampledValue = meterValuesClone;
            }
            else  {
                sampledValueLcl.sampledValue = [meterValuesClone];
            }
            for (let index = 0; index < sampledValueLcl.sampledValue.length; index++) {
                if (sampledValueLcl.sampledValue[index].measurand && sampledValueLcl.sampledValue[index].measurand === 'SoC') {
                    sampledValueLcl.sampledValue[index].value = Math.floor(Math.random()*100)+1;
                    if (sampledValueLcl.sampledValue[index].value > 100)
                    console.log("Meter type: "+ 
                                (sampledValueLcl.sampledValue[index].measurand ? sampledValueLcl.sampledValue[index].measurand : 'default') +
                                 " value: " + sampledValueLcl.sampledValue[index].value);
                } else {

                    sampledValueLcl.sampledValue[index].value = Math.round((Math.floor(Math.random()*self._stationInfo.maxPower-500)+500) * 3600 / interval);
                    if (sampledValueLcl.sampledValue[index].value > (self._stationInfo.maxPower* 3600 / interval) || sampledValueLcl.sampledValue[index].value < 500)
                    console.log("Meter type: " + 
                                    (sampledValueLcl.sampledValue[index].measurand ? sampledValueLcl.sampledValue[index].measurand : 'default') +
                                     " value: " + sampledValueLcl.sampledValue[index].value + "/" + (self._stationInfo.maxPower * 3600 / interval));
                }
                
            }
            
            let payload = {
                connectorId: connectorID,
                meterValue: [sampledValueLcl]
            }
            await self.sendMessage(uuid(), payload, Constants.OCPP_JSON_CALL_MESSAGE, "MeterValues");
        } catch (error) {
            console.log("Send error:" + error);
        }
    }

    async startMeterValues(self, connectorID, interval) {
        if (!this._isStarted && !this._connectors[connectorID].transactionStarted) return;
        this._connectors[connectorID].transactionInterval = setInterval(async () => {
            const sendMeterValues = performance.timerify(this.sendMeterValues);
            _performanceObserver.observe({entryTypes: ['function']});
            await sendMeterValues(self, connectorID, interval);
        }, interval);
    }

    async handleRemoteStopTransaction(commandPayload) {
        for (let connector in this._connectors) {
            if (this._connectors[connector].transactionId === commandPayload.transactionId) {
                this.sendStopTransaction(commandPayload.transactionId, connector);
            }
        };
        return {
            status: "Accepted"
        };
    }

    isAuthorizationrequested() {
        return this._authorizedKeys && this._authorizedKeys.length > 0;
    }
    
    getRandomTagId() {
        const index = Math.round(Math.floor(Math.random()*this._authorizedKeys.length-1));
        return this._authorizedKeys[index];
    }
}

module.exports = ChargingStation;