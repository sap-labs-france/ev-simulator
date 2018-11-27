const Configuration = require('./Configuration');
const Constants = require('./Constants');
const Utils = require('./Utils');
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

    static addPerformanceTimer(command, duration){
        let currentStatistics;
// Map to proper commande name
        const MAPCOMMAND = {
            sendMeterValues : 'MeterValues',
            startTransaction : 'StartTransaction',
            stopTransaction : 'StopTransaction'
        }
        if (MAPCOMMAND[command]) { // get current command statistics
            currentStatistics = _statistics[MAPCOMMAND[command]];
        } else if (_statistics[command]) {
            currentStatistics = _statistics[command];
        } else {
            _statistics[command] = {};
            currentStatistics = _statistics[command];
        }

        if (currentStatistics) {
// update current statistics timers
            currentStatistics.countTime = (currentStatistics.countTime ? currentStatistics.countTime + 1 : 1);
            currentStatistics.minTime = (currentStatistics.minTime ? (currentStatistics.minTime > duration ? duration : currentStatistics.minTime) :  duration);
            currentStatistics.maxTime = (currentStatistics.maxTime ? (currentStatistics.maxTime < duration ? duration : currentStatistics.maxTime) :  duration);
            currentStatistics.totalTime = (currentStatistics.totalTime ? currentStatistics.totalTime + duration : duration);
            currentStatistics.avgTime = currentStatistics.totalTime / currentStatistics.countTime;
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
            console.log("Statistics displayed every " + Configuration.getStatisticsDisplayInterval() + "s");
            console.log("Configuration " + JSON.stringify(Configuration.getConfig(), null, " "));
            setInterval(() => {
                Statistics.display()
            }, Configuration.getStatisticsDisplayInterval()*1000);
        }
        
    }
}

module.exports = Statistics;