const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const COMIC_VINE_API_KEY = process.env.COMIC_VINE_API_KEY;

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
      // Query Comic Vine for volumes
      const cvResponse = await fetch(
        `https://comicvine.gamespot.com/api/volumes/?api_key=${COMIC_VINE_API_KEY}&filter=name:${encodeURIComponent(series.series_name)}&format=json`
      );
      const cvData = await cvResponse.json();

      if (!cvData.results) continue;

      for (const volume of cvData.results) {
        // Only TPBs
        if (!volume.volume_type || !volume.volume_type.includes('Trade Paperback')) continue;

        // Check if we already have this
        const { data: existing } = await supabase
          .from('tpbs')
          .select('id')
          .eq('comic_vine_volume_id', volume.id.toString())
          .single();

        if (existing) continue; // Already recorded

        // Add new TPB
        await supabase.from('tpbs').insert({
          series_id: series.id,
          comic_vine_volume_id: volume.id.toString(),
          volume_number: volume.issue_count,
          title: volume.name,
          release_date: volume.start_year ? new Date(`${volume.start_year}-01-01`) : null,
        });

        newTPBsFound++;

        // Email alert (optional — we'll add Resend later)
        console.log(`New TPB found: ${volume.name}`);
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
