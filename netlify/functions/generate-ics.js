const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

exports.handler = async () => {
  try {
    const { data: tpbs, error } = await supabase
      .from('tpbs')
      .select('*, series(series_name)')
      .order('release_date', { ascending: false });

    if (error) throw error;

    // Build ICS
    let icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Comic Vine TPB Tracker//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:Comic Vine TPBs
X-WR-TIMEZONE:UTC
REFRESH-INTERVAL;VALUE=DURATION:P1D
`;

    for (const tpb of tpbs) {
      const eventDate = tpb.release_date ? new Date(tpb.release_date).toISOString().split('T')[0].replace(/-/g, '') : '20260101';
      const uid = `tpb-${tpb.id}@comicvine-tracker`;

      icsContent += `BEGIN:VEVENT
UID:${uid}
DTSTAMP:${new Date().toISOString().replace(/[-:.]/g, '').split('Z')[0]}Z
DTSTART;VALUE=DATE:${eventDate}
SUMMARY:${tpb.series[0].series_name} - ${tpb.title}
DESCRIPTION:New TPB available
URL:https://comicvine.gamespot.com/volumes/${tpb.comic_vine_volume_id}
END:VEVENT
`;
    }

    icsContent += `END:VCALENDAR`;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="comic-vine-tpbs.ics"',
      },
      body: icsContent,
    };
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
