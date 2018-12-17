const Configuration = require('./utils/Configuration');
const ChargingStation = require('./charging-station/ChargingStation');
const Statistics = require('./utils/Statistics');
const fs = require('fs');
class Bootstrap{
    static async start() { 
        try {
            Statistics.start();
            if (Configuration.getChargingStationTemplateURLs()) {
                Configuration.getChargingStationTemplateURLs().forEach((stationURL) => {
                    try {
                        //load file
                        const fileDescriptor = fs.openSync(stationURL.file, 'r');
                        const stationTemplate = JSON.parse(fs.readFileSync(fileDescriptor, 'utf8'));
                        fs.closeSync(fileDescriptor);
                        let nbStation = (stationURL.numberOfStation ? stationURL.numberOfStation : 0);
                        for (let index = 1; index <= nbStation; index++) {
                            let station = new ChargingStation(index, JSON.parse(JSON.stringify(stationTemplate)));
                            station.start();
                        }
                    } catch (error) {
                        console.log("Template file" + stationURL.file +" error" + error);
                    }
                        
                })
            } else {
                let nbStation = Configuration.getNumberofChargingStation();
                for (let index = 1; index <= nbStation; index++) {
                    let station = new ChargingStation(index, JSON.parse(JSON.stringify(Configuration.getChargingStationTemplate())));
                    station.start();
                }
            }
        } catch (error) {
            console.log('Bootstrap start ERROR ' + JSON.stringify(error, null, ' '));
        }
    }
}

Bootstrap.start();