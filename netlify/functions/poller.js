const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

exports.handler = async () => {
  try {
    // Keep Supabase awake
    await supabase.from('last_poll').upsert({ id: 1, last_checked_at: new Date() });

    // Get all tracked series
    const { data: seriesList, error: seriesError } = await supabase
      .from('series')
      .select('*');

    if (seriesError) throw seriesError;

    let newTPBsFound = 0;

    for (const series of seriesList) {
      try {
        // Query League of Comic Geeks for releases
        const lgResponse = await fetch(
          `https://leagueofcomicgeeks.com/api/releases/search?title=${encodeURIComponent(series.series_name)}`
        );
        const lgData = await lgResponse.json();

        if (!lgData || !lgData.data || lgData.data.length === 0) {
          console.log(`No results for: ${series.series_name}`);
          continue;
        }

        // Filter for TPBs/Hardcovers
        const tpbs = lgData.data.filter(release => 
          release.type && 
          (release.type.toLowerCase().includes('trade paperback') || 
           release.type.toLowerCase().includes('hardcover'))
        );

        for (const tpb of tpbs) {
          // Check if we already have this
          const { data: existing } = await supabase
            .from('tpbs')
            .select('id')
            .eq('comic_vine_volume_id', `lcg-${tpb.id}`)
            .single();

          if (existing) continue; // Already recorded

          // Add new TPB
          await supabase.from('tpbs').insert({
            series_id: series.id,
            comic_vine_volume_id: `lcg-${tpb.id}`,
            volume_number: tpb.volume || null,
            title: tpb.title || tpb.name,
            release_date: tpb.release_date || null,
          });

          newTPBsFound++;
          console.log(`New TPB found: ${tpb.title}`);
        }
      } catch (err) {
        console.error(`Error fetching ${series.series_name}:`, err.message);
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
