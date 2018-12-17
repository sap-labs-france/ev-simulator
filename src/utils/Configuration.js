const cfenv = require('cfenv');
let config = require('../config.json');

class Configuration {
	// Read the config file
	static getConfig() {
		return config;
	}

	static getStatisticsDisplayInterval() {
		// Read conf
		return Configuration.getConfig().statisticsDisplayInterval;
	}

	static getChargingStationTemplateURLs() {
		// Read conf
		return Configuration.getConfig().stationTemplateURLs;
	}

	static getChargingStationTemplate() {
		// Read conf
		return Configuration.getConfig().stationTemplate;
	}

	static getNumberofChargingStation() {
		// Read conf
		return Configuration.getConfig().numberOfStation;
	}
	static getMeterValueInterval() {
		// Read conf
		return ( Configuration.getChargingStationConfiguration().hasOwnProperty("meterValueInterval") ? 
				 Configuration.getChargingStationConfiguration().meterValueInterval*1000 : 60000); 
	}

	static getAutomaticTransactionConfiguration() {
		// Read conf
		return Configuration.getChargingStationTemplate().AutomaticTransactionGenerator;
	}

	static getSupervisionURL() {
		// Read conf
		return Configuration.getConfig().supervisionURL;
	}

	static getEquallySupervisionDistribution() {
		return Configuration.getConfig().distributeStationToTenantEqualy;
	}

	static getChargingStationConfiguration() {
		return ( Configuration.getChargingStationTemplate().hasOwnProperty('Configuration') ? Configuration.getChargingStationTemplate().Configuration : {} );
	}

	static getChargingStationAuthorizationFile() {
		return ( Configuration.getChargingStationTemplate().hasOwnProperty('authorizationFile') ? Configuration.getChargingStationTemplate().authorizationFile : "" );
	}

	static getChargingStationConnectors() {
		return Configuration.getChargingStationTemplate().Connectors;
	}

	static getChargingStationConnector(number) {
		return Configuration.getChargingStationTemplate().Connectors[number];
	}

	
}

module.exports=Configuration;
