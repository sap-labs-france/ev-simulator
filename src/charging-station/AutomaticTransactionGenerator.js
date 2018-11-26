const CharginStation = require('./ChargingStation');
const Configuration = require('../utils/Configuration');
const Constants = require('../utils/Constants');
const Utils = require('../utils/Utils');

const _automaticConfiguration = Configuration.getAutomaticTransactionConfiguration();

class AutomaticTransactionGenerator {
    constructor(chargingStation) {
        this._chargingStation = chargingStation;
        this._timeToStop = false;
    }

    async stop() {
        console.log("ATG OVER => STOPPING ALL TRANSACTIONS");
        for (let connector in this._chargingStation._connectors) {
            if (this._chargingStation._connectors[connector].transactionStarted) {
                console.log(this.basicLog(connector) + " ATG OVER Stop transaction " + this._chargingStation._connectors[connector].transactionId);
                await this._chargingStation.sendStopTransaction(this._chargingStation._connectors[connector].transactionId, connector);                        
            }
        }
        this._timeToStop = true;
    }

    async start() {
        this._timeToStop = false;
        if (_automaticConfiguration.stopAutomaticTransactionGeneratorAfterHours && 
            _automaticConfiguration.stopAutomaticTransactionGeneratorAfterHours > 0) {
            console.log("ATG will stop in " + Utils.secondstoHHMMSS(_automaticConfiguration.stopAutomaticTransactionGeneratorAfterHours*3600));
            setTimeout(() => {
                this.stop();
            }, _automaticConfiguration.stopAutomaticTransactionGeneratorAfterHours*3600*1000)
        }
        for (const connector in this._chargingStation._connectors) {
            if (connector > 0)
                this.startConnector(connector);
        }
    }

    basicLog(connectorId) {
        let date=new Date();
        return date.toISOString().substr(0, 19) + " ATG " + this._chargingStation._stationInfo.name + "#" + connectorId + "#";
    }

    async startConnector(connectorId) {
        do {
            let wait = Utils.getRandomInt(_automaticConfiguration.maxDelayBetweenTwoTransaction, _automaticConfiguration.minDelayBetweenTwoTransaction) * 1000;
            console.log(this.basicLog(connectorId) + " wait for " + Utils.secondstoHHMMSS(wait/1000));
            await Utils.sleep( wait  )
            if (this._timeToStop) break;
            let start = Math.random();
            let skip = 0;
            if (start < _automaticConfiguration.probabilityOfStart) {
                skip = 0;
                //start transaction
                console.log(this.basicLog(connectorId) + " Start transaction  ");                
                await this._chargingStation.sendStartTransaction(connectorId);
                // wait until end of transaction
                let wait = Utils.getRandomInt(_automaticConfiguration.maxDuration, _automaticConfiguration.minDuration)* 1000;
                console.log(this.basicLog(connectorId) + " transaction " + this._chargingStation._connectors[connectorId].transactionId + " will stop in " + Utils.secondstoHHMMSS(wait/1000));
                await Utils.sleep(wait);
                // Stop transaction
                if (this._chargingStation._connectors[connectorId].transactionStarted) {
                    console.log(this.basicLog(connectorId) + " Stop transaction " + this._chargingStation._connectors[connectorId].transactionId);
                    await this._chargingStation.sendStopTransaction(this._chargingStation._connectors[connectorId].transactionId, connectorId);
                }
            } else {
                skip++;
                console.log(this.basicLog(connectorId) + "transaction skipped " + skip);
            }
        } while (!this._timeToStop);
        console.log("ATG for station  " + this._chargingStation._stationInfo.name + " is STOPPED");
    }
}

module.exports = AutomaticTransactionGenerator;