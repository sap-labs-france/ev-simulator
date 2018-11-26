const Configuration = require('./utils/Configuration');
const Constants = require('./utils/Constants');
const Utils = require('./utils/Utils');
const _statistics = {} 
class Statistics {

    static addMessage(command, chargingStation, response=false) {
        if (response) {
            if (_statistics[command]) {
              if (_statistics[command].countResponse) {
                _statistics[command].countResponse++;
              } else {
                _statistics[command].countResponse = 1;
              }
            } else {
                _statistics[command] = {};
                _statistics[command].countResponse = 1;
            }
        } else {
            if (_statistics[command] && _statistics[command].count) {
                _statistics[command].count++;
            } else {
                _statistics[command] = {};
                _statistics[command].count = 1;
            }
        }
    }

    static display() {
        let date=new Date();
        console.log(date.toISOString().substr(0, 19) + " STATISTICS START");
        console.log(JSON.stringify(_statistics, null, " "));
        console.log(date.toISOString().substr(0, 19) + " STATISTICS END");
    }

    static async start() {
        if (Configuration.getStatisticsDisplayInterval()) {
            console.log("Statistics started every " + Configuration.getStatisticsDisplayInterval() + "s");
            setInterval(() => {
                Statistics.display()
            }, Configuration.getStatisticsDisplayInterval()*1000);
        }
        
    }
}

module.exports = Statistics;