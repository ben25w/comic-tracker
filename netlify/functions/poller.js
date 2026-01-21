const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

exports.handler = async () => {
  try {
    await supabase.from('last_poll').upsert({ id: 1, last_checked_at: new Date() });

    const { data: seriesList, error: seriesError } = await supabase
      .from('series')
      .select('*');

    if (seriesError) throw seriesError;

    let newTPBsFound = 0;

    for (const series of seriesList) {
      try {
        console.log(`Searching Google Books for: ${series.series_name}`);
        
        // Search for trade paperbacks
        const query = `${series.series_name} trade paperback`;
        const gbResponse = await fetch(
          `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=40`
        );
        
        const gbData = await gbResponse.json();
        console.log(`Response status: ${gbResponse.status}`);

        if (!gbData.items || gbData.items.length === 0) {
          console.log(`No results for: ${series.series_name}`);
          continue;
        }

        console.log(`Found ${gbData.items.length} results for ${series.series_name}`);

        for (const book of gbData.items) {
          const volumeInfo = book.volumeInfo;
          
          // Check if it's actually a trade paperback
          if (!volumeInfo.title.toLowerCase().includes('trade paperback') &&
              !volumeInfo.description?.toLowerCase().includes('trade paperback')) {
            continue;
          }

          // Check if we already have this
          const bookId = book.id;
          const { data: existing } = await supabase
            .from('tpbs')
            .select('id')
            .eq('comic_vine_volume_id', `gb-${bookId}`)
            .limit(1);

          if (existing && existing.length > 0) continue;

          const publishedDate = volumeInfo.publishedDate ? new Date(volumeInfo.publishedDate) : null;

          await supabase.from('tpbs').insert({
            series_id: series.id,
            comic_vine_volume_id: `gb-${bookId}`,
            volume_number: null,
            title: volumeInfo.title,
            release_date: publishedDate,
          });

          newTPBsFound++;
          console.log(`New TPB found: ${volumeInfo.title}`);
        }
      } catch (err) {
        console.error(`Error with ${series.series_name}:`, err.message);
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: `Checked ${seriesList.length} series. Found ${newTPBsFound} new TPBs.` }),
    };
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
