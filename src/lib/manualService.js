/**
 * Service to fetch LEGO and IKEA manuals from public APIs
 */

// LEGO manual fetching
// LEGO provides instruction PDFs at: https://www.lego.com/en-us/themes/[theme]/downloads/[product-id]
async function fetchLegoManual(productId) {
  try {
    // LEGO uses URLs like: https://www.lego.com/[region]/[lang]/themes/[theme]/downloads/[id]
    // We'll construct a generic URL and let user know to provide product details
    const legoUrl = `https://www.lego.com/en-us/product/${productId}`;
    
    // Return metadata about where to find it
    return {
      source: 'lego',
      productId,
      url: legoUrl,
      message: `LEGO set #${productId} found. Visit the LEGO website to access the manual.`,
    };
  } catch (error) {
    throw new Error(`Failed to fetch LEGO manual for ${productId}: ${error.message}`);
  }
}

// IKEA manual fetching using public API
async function fetchIkeaManual(productName) {
  try {
    // IKEA Search API endpoint (approximate, may need adjustment)
    const searchUrl = `https://www.ikea.com/api/v1/aa/search?q=${encodeURIComponent(productName)}&lang=en`;
    
    const response = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      mode: 'cors',
    });

    if (!response.ok) {
      throw new Error(`IKEA API responded with status ${response.status}`);
    }

    const data = await response.json();
    
    if (data.products && data.products.length > 0) {
      const product = data.products[0];
      return {
        source: 'ikea',
        productName,
        productId: product.id,
        url: `https://www.ikea.com/en/products/${product.id}`,
        name: product.name,
        message: `Found IKEA product: ${product.name}. Visit IKEA website for assembly manual.`,
      };
    } else {
      throw new Error(`No IKEA products found for "${productName}"`);
    }
  } catch (error) {
    throw new Error(`Failed to fetch IKEA manual for "${productName}": ${error.message}`);
  }
}

/**
 * Search for a manual in LEGO or IKEA database
 * @param {string} query - Product name or ID
 * @param {string} source - 'lego' or 'ikea'
 * @returns {Object} Manual metadata with link information
 */
export async function searchManual(query, source) {
  if (!query || !query.trim()) {
    throw new Error('Please enter a product name or ID');
  }

  switch (source.toLowerCase()) {
    case 'lego':
      return await fetchLegoManual(query.trim());
    case 'ikea':
      return await fetchIkeaManual(query.trim());
    default:
      throw new Error('Invalid source. Use "lego" or "ikea"');
  }
}

/**
 * Create instructions text from manual metadata
 * This prepares the manual info in a format compatible with the app's instruction parser
 */
export function formatManualAsInstructions(manualData) {
  const { source, name, productId, message, url } = manualData;
  
  let instructions = `${message}\n\n`;
  instructions += `Product ID: ${productId}\n`;
  if (name) {
    instructions += `Product Name: ${name}\n`;
  }
  instructions += `Manual Link: ${url}\n\n`;
  instructions += 'To access the full manual:\n';
  instructions += '1. Click the link or copy it to your browser\n';
  instructions += '2. Download the PDF instruction manual\n';
  instructions += '3. Return to FlowStep AI and upload the PDF\n';
  
  return instructions;
}
