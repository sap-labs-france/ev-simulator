const Configuration = require('./utils/Configuration');
const ChargingStation = require('./charging-station/ChargingStation');
const Statistics = require('./statistics');
class Bootstrap{
    static async start() { 
        try {
            Statistics.start();
            let nbStation = Configuration.getNumberofChargingStation();
            for (let index = 1; index <= nbStation; index++) {
                let station = new ChargingStation(index);
                station.start();
            }
        } catch (error) {
            console.log('Bootstrap start ERROR ' + JSON.stringify(error, null, ' '));
        }
    }
}

Bootstrap.start();