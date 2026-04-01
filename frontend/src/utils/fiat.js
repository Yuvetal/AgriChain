export const fetchEthToInrRate = async () => {
    const cacheKey = "ETH_INR_RATE";
    const cacheTimeKey = "ETH_INR_RATE_TIMESTAMP";
    
    const now = new Date().getTime();
    const cachedTime = localStorage.getItem(cacheTimeKey);
    const cachedRate = localStorage.getItem(cacheKey);
  
    // Use 5-minute cache (300,000 ms) to prevent API rate-blocking from CoinGecko
    if (cachedRate && cachedTime && now - parseInt(cachedTime) < 300000) {
      return parseFloat(cachedRate);
    }
  
    try {
      const response = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=inr");
      const data = await response.json();
      const liveRate = data.ethereum.inr;
      
      localStorage.setItem(cacheKey, liveRate.toString());
      localStorage.setItem(cacheTimeKey, now.toString());
      
      return liveRate;
    } catch (error) {
      console.warn("Failed to fetch live ETH/INR oracle stream. Failing safely back to 300,000 baseline proxy.", error);
      return 300000;
    }
  };
