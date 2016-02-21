RSUTaxCalculator = (function() {
	function RSUTaxCalculator() {};
	 
	var daysForEligibility = 365 * 2;
	var nationalInsuranceTax = 0.12;
	var capitalGainTax = 0.25;
	
	var ticker;
	var grantDate;
	var marginalIncomeTax;

	/*
	   stockSymbol: (String) AAPL, EBAY, NOB, etc`...
       startDate: (String) 2013/01/31
       endDate: ditto
       callback: (function)
	*/
	function getQuandlFinanceData(stockSymbol, startDate, endDate, callback) {
		var start = new Date(startDate),
			end   = new Date(endDate),
			data  = [];
		
		var startDateString = "" + start.getFullYear() + "-" + (start.getMonth() + 1) + "-" + start.getDate();
		var endDateString = "" + end.getFullYear() + "-" + (end.getMonth() + 1) + "-" + end.getDate();
        
		
        // TODO allow GOOG retreivals from other stock markets, not just NASDAQ. for instance, Visa (V) is not on NASDAQ 
		var datasetGoogURLPrefix = "https://www.quandl.com/api/v3/datasets/GOOG/NASDAQ_";
		var datasetWIKIURLPrefix = "https://www.quandl.com/api/v3/datasets/WIKI/";
		var urlPath =  stockSymbol + "/data.json?column_index=4&start_date=" + startDateString + "&end_date=" + endDateString + "&order=desc";
		
		var urlGoog = datasetGoogURLPrefix + urlPath;
		var urlWIKI = datasetWIKIURLPrefix + urlPath;
		
        fetchival(urlGoog).get().then(function(json) {
            data = json.dataset_data.data;
            console.log(json);
            callback(null, data);
        }).catch(function(err) {
            fetchival(urlWIKI).get().then(function(json) {
                data = json.dataset_data.data;
                console.log(json);
                callback(null, data);
            }).catch(function(err) {
                console.log(err)
                callback(err);
            })
        })

	}
   
    /*
        ticker: (String)
        grantDate: (Date)
        marginalTaxRate: (int)
        callback: (function)
    */
	RSUTaxCalculator.prototype.getGrantInfo = function(ticker, grantDate, marginalTaxRate, callback) {
        var grantDate = new Date(grantDate);
        var millisecOneDay = 24*60*60*1000;
        var millisec45Days = 45*millisecOneDay; 
        var millisec7Days = 7*millisecOneDay;
        var date45DyasBeforeGrant = new Date(grantDate.getTime() - millisec45Days);
        var today = new Date();
        var lastWeek = new Date(today.getTime() - millisec7Days);
        var daysFromGrant = Math.floor((today.getTime() - grantDate.getTime())/millisecOneDay);
        var eligibleFor102 = daysFromGrant > 365*2;  
        var personalTaxRate = parseFloat(marginalTaxRate) + parseFloat(nationalInsuranceTax);
        var daysUntileligibleFor102 = Math.ceil((grantDate.getTime() + daysForEligibility * millisecOneDay - today.getTime()) / millisecOneDay);
         

// validity check: 
// today grant date is less than today
    
        function getStockPriceForDate(ticker, lastWeek, today) {
            return new Promise(function (resolve, reject) {
                getQuandlFinanceData(ticker, lastWeek, today, function(err, result){
                    if (err){
                        reject(err);
                        return;
                    }
                    var lastPrice = result[result.length - 1][1];
                    resolve(lastPrice);
                });            
                
            });
        }
        
        function getCostBasisForGrantDate(ticker, date45DyasBeforeGrant, grantDate){
            return new Promise(function (resolve, reject) {
                getQuandlFinanceData(ticker, date45DyasBeforeGrant, grantDate, function(err, result){
                    if (err){
                        reject(err);
                        return;
                    }
                    var sum = 0;
                    for (var i = 0 ; i < result.length && i <= 30; i++){
                        sum += result[i][1];
                    }
                    var costBasis;
                    if (result.length < 30) {
                        // TODO not enough data to compute cost basis
                    } else {
                        costBasis = sum/30;
                    }
                    
                    resolve(costBasis);
                });
            });
        }

        var promiseStockPrice = getStockPriceForDate(ticker, lastWeek, today);
        var promiseCostBasis = getCostBasisForGrantDate(ticker, date45DyasBeforeGrant, grantDate);
        var promises = [promiseStockPrice, promiseCostBasis];
        
        Promise.all(promises).then(function (values) { console.log("p", values); });
                
        // get todays stock price
        getQuandlFinanceData(ticker, lastWeek, today, function(err, result){
            if (err){
                callback(err);
                return;
            }
            var lastPrice = result[result.length - 1][1];
            
            // get average of 30 trading days
            getQuandlFinanceData(ticker, date45DyasBeforeGrant, grantDate, function(err, result){
                if (err){
                    callback(err);
                    return;
                }
                var sum = 0;
                for (var i = 0 ; i < result.length && i <= 30; i++){
                    sum += result[i][1];
                }
                var costBasis;
                if (result.length < 30) {
                    // TODO not enough data to compute cost basis
                } else {
                    costBasis = sum/30;
                    
                }
                
                var partEligibleFor102 = lastPrice - costBasis;
                var partOfSaleForIncomeTax = lastPrice > costBasis && eligibleFor102 ? costBasis : lastPrice;
                var partOfSaleForCapitalTax = lastPrice - partOfSaleForIncomeTax;
                var regularTax = partOfSaleForIncomeTax * personalTaxRate;
                var capitalTax = partOfSaleForCapitalTax * capitalGainTax;
                var totalTax = regularTax + capitalTax;
                var totalGain = lastPrice - totalTax; 
                
                var taxWithout102 = lastPrice * personalTaxRate;
                var gainWithout102 = lastPrice - taxWithout102;
                var gainWith102 = lastPrice - costBasis * personalTaxRate - (lastPrice - costBasis) * capitalTax;
                
                // add gainWith102 even if not eligible yet
                
                var equilibriumCalculation = {};
                if (daysUntileligibleFor102 > 0) {
                    equilibriumCalculation.gainOnCostBasis = costBasis * (1 - personalTaxRate);
                    equilibriumCalculation.futureEquilibriumPrice = (gainWithout102 - equilibriumCalculation.gainOnCostBasis)/(1 - capitalTax) + costBasis;
                }
                
                callback(null, {
                    daysFromGrant : daysFromGrant,
                    eligibleFor102 : eligibleFor102,
                    daysUntileligibleFor102 : daysUntileligibleFor102,
                    lastPrice : lastPrice,
                    costBasis : costBasis,
                    partEligibleFor102 : partEligibleFor102,
                    partOfSaleForIncomeTax : partOfSaleForIncomeTax,
                    partOfSaleForCapitalTax : partOfSaleForCapitalTax,
                    regularTax : regularTax,
                    capitalTax : capitalTax,
                    totalTax : totalTax, 
                    totalGain : totalGain,
                    gainWith102 : gainWith102,
                    taxWithout102 : taxWithout102,
                    gainWithout102 : gainWithout102,
                    equilibriumCalculation : equilibriumCalculation
                })
            });
        });
        
    };
	
	return RSUTaxCalculator;
})();

