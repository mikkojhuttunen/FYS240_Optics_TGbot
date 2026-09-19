/**
 * FYS.240 Optics - Video References Database
 * DATA_VERSION: 1.1.0 (bump when videos/segments are regenerated or the
 * module's shape changes — see bot_fys240.js's BOT_VERSION/CHANGELOG for
 * the overall bot versioning convention this follows)
 *
 * Functionality:
 *   - all()/getVideo()/getChapter()/getChapters()/getTopics() — basic lookups
 *   - search()/findBestMatch() — keyword search across EN + FI titles
 *   - findSegment()/findRelevantSegments()/getSegments() — in-video
 *     timestamp lookups, exact substring or fuzzy token-overlap matching
 *
 * Lightweight data format for Telegram bot
 * Generated from YouTube analytics CSV (English + Finnish playlists)
 *
 * Each video's primary fields (id/chapter/topic/url) are the English
 * recording, matching the original lightweight shape used by bot_fys240.js.
 * Where a Finnish recording of the same lecture also exists, its id/url/title
 * are included as *_fi fields (ignored by code that doesn't look for them).
 *
 * Usage:
 *   const db = require('./fys240_videos');
 *   db.search('lenses');        // Find videos about lenses
 *   db.getChapter('10.3');      // Get all videos for chapter 10.3
 *   db.getVideo('WKIGee5ISaw'); // Get specific video
 *   db.findSegment('irradianssi'); // Find the specific in-video moment
 *
 * In-video timestamps (chapter markers pasted from YouTube descriptions,
 * added with add_video_segments.js) live separately in video_segments.json
 * so regenerating this file from a fresh CSV never wipes them out. They are
 * merged onto each video below as a `segments` array: [{t: seconds, label}].
 */

const fs = require("fs");
const path = require("path");

let SEGMENTS = {};
try {
  SEGMENTS = JSON.parse(fs.readFileSync(path.join(__dirname, "video_segments.json"), "utf8"));
} catch (e) {
  // No segments file yet, or it's unreadable — videos just won't have
  // in-video timestamps until add_video_segments.js creates/fixes it.
}

const VIDEOS = [
  {
    "id": "YF0EGDxvILI",
    "chapter": "2.1",
    "topic": "Electromagnetic waves",
    "url": "https://www.youtube.com/watch?v=YF0EGDxvILI",
    "id_fi": "MfFv9Y37cXA",
    "url_fi": "https://www.youtube.com/watch?v=MfFv9Y37cXA",
    "topic_fi": "Sähkömagneettiset aallot"
  },
  {
    "id": "Hpst5RnWvWk",
    "chapter": "2.2",
    "topic": "Rays",
    "url": "https://www.youtube.com/watch?v=Hpst5RnWvWk",
    "id_fi": "sA15dZsSNV4",
    "url_fi": "https://www.youtube.com/watch?v=sA15dZsSNV4",
    "topic_fi": "Säteet"
  },
  {
    "id": "7_8dAL5p2Uo",
    "chapter": "2.3",
    "topic": "Particles",
    "url": "https://www.youtube.com/watch?v=7_8dAL5p2Uo",
    "id_fi": "mHYSquFXcvY",
    "url_fi": "https://www.youtube.com/watch?v=mHYSquFXcvY",
    "topic_fi": "Hiukkaset"
  },
  {
    "id": "67WIeeSZ8J8",
    "chapter": "3.1",
    "topic": "Moving perturbation",
    "url": "https://www.youtube.com/watch?v=67WIeeSZ8J8",
    "id_fi": "vN1Sq4MQmH0",
    "url_fi": "https://www.youtube.com/watch?v=vN1Sq4MQmH0",
    "topic_fi": "Liikkuva häiriö"
  },
  {
    "id": "G7LuVFfkgH4",
    "chapter": "3.2",
    "topic": "Wave equation",
    "url": "https://www.youtube.com/watch?v=G7LuVFfkgH4",
    "id_fi": "II4QfIcltdI",
    "url_fi": "https://www.youtube.com/watch?v=II4QfIcltdI",
    "topic_fi": "Aaltoyhtälö"
  },
  {
    "id": "pzzjQhhXdkE",
    "chapter": "3.3",
    "topic": "Harmonic waves",
    "url": "https://www.youtube.com/watch?v=pzzjQhhXdkE",
    "id_fi": "BlyOBramP8I",
    "url_fi": "https://www.youtube.com/watch?v=BlyOBramP8I",
    "topic_fi": "Harmoninen aalto"
  },
  {
    "id": "FDyq6eIYGW4",
    "chapter": "3.4",
    "topic": "Phase and phase velocity",
    "url": "https://www.youtube.com/watch?v=FDyq6eIYGW4",
    "id_fi": "bjc6RoL_OkI",
    "url_fi": "https://www.youtube.com/watch?v=bjc6RoL_OkI",
    "topic_fi": "Vaihe ja vaihenopeus"
  },
  {
    "id": "dyMMYWWq61Q",
    "chapter": "3.5",
    "topic": "Superposition principle",
    "url": "https://www.youtube.com/watch?v=dyMMYWWq61Q",
    "id_fi": "nfvA3Ro-Xgw",
    "url_fi": "https://www.youtube.com/watch?v=nfvA3Ro-Xgw",
    "topic_fi": "Superpositioperiaate"
  },
  {
    "id": "Ve6Y_WjFSOc",
    "chapter": "3.6",
    "topic": "Complex representation of waves",
    "url": "https://www.youtube.com/watch?v=Ve6Y_WjFSOc",
    "id_fi": "4Ws_6MzHe08",
    "url_fi": "https://www.youtube.com/watch?v=4Ws_6MzHe08",
    "topic_fi": "Aaltojen kompleksinen esitys"
  },
  {
    "id": "_tcGbrTCQJk",
    "chapter": "3.7",
    "topic": "Plane waves",
    "url": "https://www.youtube.com/watch?v=_tcGbrTCQJk",
    "id_fi": "F_eQY3kH5pU",
    "url_fi": "https://www.youtube.com/watch?v=F_eQY3kH5pU",
    "topic_fi": "Tasoaallot"
  },
  {
    "id": "Ake1joldkjQ",
    "chapter": "3.8",
    "topic": "Wave equation in three-dimensional space",
    "url": "https://www.youtube.com/watch?v=Ake1joldkjQ",
    "id_fi": "4comdeP8QWY",
    "url_fi": "https://www.youtube.com/watch?v=4comdeP8QWY",
    "topic_fi": "Aaltoyhtälö kolmessa ulottuvuudessa"
  },
  {
    "id": "maSfD-56GyE",
    "chapter": "3.9",
    "topic": "Spherical and cylindrical waves",
    "url": "https://www.youtube.com/watch?v=maSfD-56GyE",
    "id_fi": "qvASDTXJss0",
    "url_fi": "https://www.youtube.com/watch?v=qvASDTXJss0",
    "topic_fi": "Pallo- ja sylinteriaallot"
  },
  {
    "id": "bH4obSrWKu0",
    "chapter": "3.10",
    "topic": "Vector fields",
    "url": "https://www.youtube.com/watch?v=bH4obSrWKu0",
    "id_fi": "W37_AzacniU",
    "url_fi": "https://www.youtube.com/watch?v=W37_AzacniU",
    "topic_fi": "Vektorikentät ja valon polarisaatio"
  },
  {
    "id": "GSxubtjbaGw",
    "chapter": "3.11",
    "topic": "Tutorial on vector calculus",
    "url": "https://www.youtube.com/watch?v=GSxubtjbaGw",
    "id_fi": "GP6R2SD7xUs",
    "url_fi": "https://www.youtube.com/watch?v=GP6R2SD7xUs",
    "topic_fi": "Vektorianalyysin perusteet"
  },
  {
    "id": "94iUDGD4Zds",
    "chapter": "3.12",
    "topic": "Electrostatic approximation and potentials",
    "url": "https://www.youtube.com/watch?v=94iUDGD4Zds",
    "id_fi": "xvdkqsoE55c",
    "url_fi": "https://www.youtube.com/watch?v=xvdkqsoE55c",
    "topic_fi": "Sähköstatiikka ja sähköstaattiset potentiaalit"
  },
  {
    "id": "qTUo4-5at-g",
    "chapter": "4.1",
    "topic": "Microscopic Maxwells equations",
    "url": "https://www.youtube.com/watch?v=qTUo4-5at-g",
    "id_fi": "lu3CBQFeaFM",
    "url_fi": "https://www.youtube.com/watch?v=lu3CBQFeaFM",
    "topic_fi": "Mikroskooppiset Maxwellin yhtälöt"
  },
  {
    "id": "sQxY5lPnGqU",
    "chapter": "4.2",
    "topic": "Transverse waves and charge conservation",
    "url": "https://www.youtube.com/watch?v=sQxY5lPnGqU",
    "id_fi": "uWUN2LZwbXU",
    "url_fi": "https://www.youtube.com/watch?v=uWUN2LZwbXU",
    "topic_fi": "Poikittainen aaltoliike ja varauksen säilyminen"
  },
  {
    "id": "qPxBAoaT_Dc",
    "chapter": "4.3",
    "topic": "Energy of the electromagnetic field",
    "url": "https://www.youtube.com/watch?v=qPxBAoaT_Dc",
    "id_fi": "KCRFMlnFNbQ",
    "url_fi": "https://www.youtube.com/watch?v=KCRFMlnFNbQ",
    "topic_fi": "Sähkömagneettisen kentän energia"
  },
  {
    "id": "oy_dKWcBdEU",
    "chapter": "4.4",
    "topic": "Radiation pressure and momentum of electromagnetic field",
    "url": "https://www.youtube.com/watch?v=oy_dKWcBdEU",
    "id_fi": "0Sa8yiBKW6k",
    "url_fi": "https://www.youtube.com/watch?v=0Sa8yiBKW6k",
    "topic_fi": "Säteilypaine ja liikemäärä"
  },
  {
    "id": "2DzOMc2TNXg",
    "chapter": "4.5",
    "topic": "Dipole radiation",
    "url": "https://www.youtube.com/watch?v=2DzOMc2TNXg",
    "id_fi": "BP5tEo9OGJM",
    "url_fi": "https://www.youtube.com/watch?v=BP5tEo9OGJM",
    "topic_fi": "Dipolikenttä"
  },
  {
    "id": "UQhWzsds36Y",
    "chapter": "4.6",
    "topic": "Macroscopic Maxwells equations",
    "url": "https://www.youtube.com/watch?v=UQhWzsds36Y",
    "id_fi": "-kGaj4ONpq0",
    "url_fi": "https://www.youtube.com/watch?v=-kGaj4ONpq0",
    "topic_fi": "Maxwellin yhtälöt väliaineessa"
  },
  {
    "id": "-M_cmF5Yr_0",
    "chapter": "5.1",
    "topic": "Radiation from atoms and molecules",
    "url": "https://www.youtube.com/watch?v=-M_cmF5Yr_0",
    "id_fi": "RqimjuYdDGA",
    "url_fi": "https://www.youtube.com/watch?v=RqimjuYdDGA",
    "topic_fi": "Atomien ja molekyylien säteily"
  },
  {
    "id": "zSxO_lvWLCo",
    "chapter": "5.2",
    "topic": "Basic light matter interactions",
    "url": "https://www.youtube.com/watch?v=zSxO_lvWLCo",
    "id_fi": "ifhrp3ELmFs",
    "url_fi": "https://www.youtube.com/watch?v=ifhrp3ELmFs",
    "topic_fi": "Valon ja aineen vuorovaikutus"
  },
  {
    "id": "OuJEnxBIMow",
    "chapter": "5.3",
    "topic": "Lorentz model of an atom",
    "url": "https://www.youtube.com/watch?v=OuJEnxBIMow",
    "id_fi": "iWWeet0tZVo",
    "url_fi": "https://www.youtube.com/watch?v=iWWeet0tZVo",
    "topic_fi": "Lorentzin atomimalli"
  },
  {
    "id": "IjpJ9CPpNzY",
    "chapter": "5.4",
    "topic": "Lasing principle",
    "url": "https://www.youtube.com/watch?v=IjpJ9CPpNzY",
    "id_fi": "Cue9WoDlcC0",
    "url_fi": "https://www.youtube.com/watch?v=Cue9WoDlcC0",
    "topic_fi": "Laserin toimintaperiaate"
  },
  {
    "id": "f2zWQFZy3ro",
    "chapter": "6.1",
    "topic": "Wave fronts and rays",
    "url": "https://www.youtube.com/watch?v=f2zWQFZy3ro",
    "id_fi": "2yhzPfIstK0",
    "url_fi": "https://www.youtube.com/watch?v=2yhzPfIstK0",
    "topic_fi": "Aaltorintamat ja säteet"
  },
  {
    "id": "rZpevBG15wM",
    "chapter": "6.2",
    "topic": "Phenomenology of transmission and reflection",
    "url": "https://www.youtube.com/watch?v=rZpevBG15wM",
    "id_fi": "kHYNBBSaG5Y",
    "url_fi": "https://www.youtube.com/watch?v=kHYNBBSaG5Y",
    "topic_fi": "Läpäisy ja heijastus ilmiöinä"
  },
  {
    "id": "v2xMj_Ln2CU",
    "chapter": "6.3",
    "topic": "Electromagnetic theory of reflection and refraction",
    "url": "https://www.youtube.com/watch?v=v2xMj_Ln2CU",
    "id_fi": "yvGUqkLMh3w",
    "url_fi": "https://www.youtube.com/watch?v=yvGUqkLMh3w",
    "topic_fi": "Läpäisyn ja heijastuksen SMG teoria"
  },
  {
    "id": "TY301VRuhws",
    "chapter": "6.4",
    "topic": "Fresnel coefficients",
    "url": "https://www.youtube.com/watch?v=TY301VRuhws",
    "id_fi": "MdneBZEQLdI",
    "url_fi": "https://www.youtube.com/watch?v=MdneBZEQLdI",
    "topic_fi": "Fresnelin kertoimet"
  },
  {
    "id": "v8EnoFFq8j4",
    "chapter": "6.5",
    "topic": "Reflectivity and transmissivity",
    "url": "https://www.youtube.com/watch?v=v8EnoFFq8j4",
    "id_fi": "_JWAPu0VUW8",
    "url_fi": "https://www.youtube.com/watch?v=_JWAPu0VUW8",
    "topic_fi": "Heijastavuus ja läpäisevyys"
  },
  {
    "id": "nL2UDvMp8xY",
    "chapter": "6.6",
    "topic": "Total internal reflection",
    "url": "https://www.youtube.com/watch?v=nL2UDvMp8xY",
    "id_fi": "dhQ1F7Rfh2A",
    "url_fi": "https://www.youtube.com/watch?v=dhQ1F7Rfh2A",
    "topic_fi": "Kokonaisheijastus"
  },
  {
    "id": "RE2w02PdXPM",
    "chapter": "7.1",
    "topic": "Superposition principle",
    "url": "https://www.youtube.com/watch?v=RE2w02PdXPM",
    "id_fi": "2hjW5XEqi1c",
    "url_fi": "https://www.youtube.com/watch?v=2hjW5XEqi1c",
    "topic_fi": "Superpositioperiaate"
  },
  {
    "id": "Vcyz3UGkx5g",
    "chapter": "7.2",
    "topic": "Harmonic waves",
    "url": "https://www.youtube.com/watch?v=Vcyz3UGkx5g",
    "id_fi": "pl7rt9eEM4E",
    "url_fi": "https://www.youtube.com/watch?v=pl7rt9eEM4E",
    "topic_fi": "Harmoniset aallot"
  },
  {
    "id": "QjukxExTOA4",
    "chapter": "7.3",
    "topic": "Standing waves",
    "url": "https://www.youtube.com/watch?v=QjukxExTOA4",
    "id_fi": "Zgcmyyb2zJU",
    "url_fi": "https://www.youtube.com/watch?v=Zgcmyyb2zJU",
    "topic_fi": "Seisovat aallot"
  },
  {
    "id": "Ccz-BpQwsgM",
    "chapter": "7.4",
    "topic": "Superposition of several frequencies",
    "url": "https://www.youtube.com/watch?v=Ccz-BpQwsgM",
    "id_fi": "s8itpLTTBcE",
    "url_fi": "https://www.youtube.com/watch?v=s8itpLTTBcE",
    "topic_fi": "Usean aallon superpositio ja koherenssi"
  },
  {
    "id": "Ls8TMMR-Kbs",
    "chapter": "7.5",
    "topic": "Coherence",
    "url": "https://www.youtube.com/watch?v=Ls8TMMR-Kbs"
  },
  {
    "id": "YZEzxidicM0",
    "chapter": "8.1",
    "topic": "Conditions for interference",
    "url": "https://www.youtube.com/watch?v=YZEzxidicM0",
    "id_fi": "QQgsiYVPLas",
    "url_fi": "https://www.youtube.com/watch?v=QQgsiYVPLas",
    "topic_fi": "Vaatimukset interferenssille"
  },
  {
    "id": "bV3V7lFjTbQ",
    "chapter": "8.2",
    "topic": "Wavefront-splitting interferometers",
    "url": "https://www.youtube.com/watch?v=bV3V7lFjTbQ",
    "id_fi": "8Gnd1mgW9_c",
    "url_fi": "https://www.youtube.com/watch?v=8Gnd1mgW9_c",
    "topic_fi": "Aaltorintaman jakavat interferometrit"
  },
  {
    "id": "vSeFezFqK8Y",
    "chapter": "8.3",
    "topic": "Amplitude-splitting interferometers",
    "url": "https://www.youtube.com/watch?v=vSeFezFqK8Y",
    "id_fi": "3WdXDEPXnGY",
    "url_fi": "https://www.youtube.com/watch?v=3WdXDEPXnGY",
    "topic_fi": "Amplitudin jakavat interferometrit"
  },
  {
    "id": "lF1xY180co0",
    "chapter": "8.4",
    "topic": "Michelson interferometer",
    "url": "https://www.youtube.com/watch?v=lF1xY180co0",
    "id_fi": "Kqm2V5yTZVs",
    "url_fi": "https://www.youtube.com/watch?v=Kqm2V5yTZVs",
    "topic_fi": "Michelsonin interferometri"
  },
  {
    "id": "823Ks2ZCAOg",
    "chapter": "8.5",
    "topic": "Multiple-beam interference",
    "url": "https://www.youtube.com/watch?v=823Ks2ZCAOg",
    "id_fi": "dfLBiAwXB4A",
    "url_fi": "https://www.youtube.com/watch?v=dfLBiAwXB4A",
    "topic_fi": "Usean säteen interferenssi"
  },
  {
    "id": "falbEurnJjk",
    "chapter": "8.6",
    "topic": "Fabry–Perot instruments",
    "url": "https://www.youtube.com/watch?v=falbEurnJjk",
    "id_fi": "A869OP8aFyY",
    "url_fi": "https://www.youtube.com/watch?v=A869OP8aFyY",
    "topic_fi": "Fabryn–Perotin instrumentit"
  },
  {
    "id": "vSVBASzmCT4",
    "chapter": "8.7",
    "topic": "Fabry–Perot spectroscopy",
    "url": "https://www.youtube.com/watch?v=vSVBASzmCT4",
    "id_fi": "3PMbr2jd8wo",
    "url_fi": "https://www.youtube.com/watch?v=3PMbr2jd8wo",
    "topic_fi": "Fabryn–Perotin spektroskopia"
  },
  {
    "id": "_mM8QYplWtE",
    "chapter": "9.1",
    "topic": "Basic theory of diffraction",
    "url": "https://www.youtube.com/watch?v=_mM8QYplWtE",
    "id_fi": "QaEgPdf4St4",
    "url_fi": "https://www.youtube.com/watch?v=QaEgPdf4St4",
    "topic_fi": "Diffraktio-ilmiön matemaattinen malli"
  },
  {
    "id": "JphaoWz52lQ",
    "chapter": "9.2",
    "topic": "Fraunhofer diffraction",
    "url": "https://www.youtube.com/watch?v=JphaoWz52lQ",
    "id_fi": "FDsxXicvdnE",
    "url_fi": "https://www.youtube.com/watch?v=FDsxXicvdnE",
    "topic_fi": "Fraunhoferin diffraktio"
  },
  {
    "id": "9sS4kmdQn9U",
    "chapter": "9.3",
    "topic": "Diffraction from basic aperture shapes",
    "url": "https://www.youtube.com/watch?v=9sS4kmdQn9U",
    "id_fi": "MAf93waIV-g",
    "url_fi": "https://www.youtube.com/watch?v=MAf93waIV-g",
    "topic_fi": "Yksinkertaisten aukkojen diffraktio"
  },
  {
    "id": "47SHcLXCT0E",
    "chapter": "9.4",
    "topic": "Diffraction from multiple slits",
    "url": "https://www.youtube.com/watch?v=47SHcLXCT0E",
    "id_fi": "kAqiJjLFBrw",
    "url_fi": "https://www.youtube.com/watch?v=kAqiJjLFBrw",
    "topic_fi": "Usean aukon diffraktio"
  },
  {
    "id": "0jrjMJzjIsA",
    "chapter": "9.5",
    "topic": "Diffraction gratings",
    "url": "https://www.youtube.com/watch?v=0jrjMJzjIsA",
    "id_fi": "iCY-G29TzMQ",
    "url_fi": "https://www.youtube.com/watch?v=iCY-G29TzMQ",
    "topic_fi": "Diffraktiohilat"
  },
  {
    "id": "WKIGee5ISaw",
    "chapter": "10.1",
    "topic": "Basic definitions",
    "url": "https://www.youtube.com/watch?v=WKIGee5ISaw",
    "id_fi": "dC3yEzq76nw",
    "url_fi": "https://www.youtube.com/watch?v=dC3yEzq76nw",
    "topic_fi": "Perusmääritelmät"
  },
  {
    "id": "6eMo9rIPaw4",
    "chapter": "10.2",
    "topic": "Refraction at a spherical surface",
    "url": "https://www.youtube.com/watch?v=6eMo9rIPaw4",
    "id_fi": "KKWAW34AfJw",
    "url_fi": "https://www.youtube.com/watch?v=KKWAW34AfJw",
    "topic_fi": "Taittuminen pallopinnalla"
  },
  {
    "id": "_P3oLukTFTE",
    "chapter": "10.3",
    "topic": "Thin lenses",
    "url": "https://www.youtube.com/watch?v=_P3oLukTFTE",
    "id_fi": "ysCrtlkMByY",
    "url_fi": "https://www.youtube.com/watch?v=ysCrtlkMByY",
    "topic_fi": "Ohut linssi"
  },
  {
    "id": "mHaqg91mdqU",
    "chapter": "10.4",
    "topic": "Image formation",
    "url": "https://www.youtube.com/watch?v=mHaqg91mdqU",
    "id_fi": "FZwXt5Y2eGw",
    "url_fi": "https://www.youtube.com/watch?v=FZwXt5Y2eGw",
    "topic_fi": "Kuvanmuodostus"
  },
  {
    "id": "pSjhB-N4yOU",
    "chapter": "10.5",
    "topic": "Combination of lenses",
    "url": "https://www.youtube.com/watch?v=pSjhB-N4yOU",
    "id_fi": "bKLgnpGzj1Y",
    "url_fi": "https://www.youtube.com/watch?v=bKLgnpGzj1Y",
    "topic_fi": "Linssisysteemit"
  },
  {
    "id": "LsSDUs54BzA",
    "chapter": "10.6",
    "topic": "Apertures and stops",
    "url": "https://www.youtube.com/watch?v=LsSDUs54BzA",
    "id_fi": "T9HaKFEX9l8",
    "url_fi": "https://www.youtube.com/watch?v=T9HaKFEX9l8",
    "topic_fi": "Aukot ja rajoittimet"
  },
  {
    "id": "XCxuW52jv-4",
    "chapter": "10.7",
    "topic": "Mirrors",
    "url": "https://www.youtube.com/watch?v=XCxuW52jv-4",
    "id_fi": "zkHP3lgIzjA",
    "url_fi": "https://www.youtube.com/watch?v=zkHP3lgIzjA",
    "topic_fi": "Peili"
  },
  {
    "id": "ZyEEYqvkbt4",
    "chapter": "10.8",
    "topic": "Prisms",
    "url": "https://www.youtube.com/watch?v=ZyEEYqvkbt4",
    "id_fi": "dPnmcCvQ8HE",
    "url_fi": "https://www.youtube.com/watch?v=dPnmcCvQ8HE",
    "topic_fi": "Prisma"
  },
  {
    "id": "uHOZb69Qcgo",
    "chapter": "10.9",
    "topic": "Human eye",
    "url": "https://www.youtube.com/watch?v=uHOZb69Qcgo",
    "id_fi": "H02bNFbiT-w",
    "url_fi": "https://www.youtube.com/watch?v=H02bNFbiT-w",
    "topic_fi": "Ihmissilmä"
  },
  {
    "id": "ZzNvEyRSFEM",
    "chapter": "10.10",
    "topic": "Magnifying glass",
    "url": "https://www.youtube.com/watch?v=ZzNvEyRSFEM",
    "id_fi": "7axzJgkErp4",
    "url_fi": "https://www.youtube.com/watch?v=7axzJgkErp4",
    "topic_fi": "Suurennuslasi"
  },
  {
    "id": "a0AGftBDXzI",
    "chapter": "10.11",
    "topic": "Eyepiece",
    "url": "https://www.youtube.com/watch?v=a0AGftBDXzI",
    "id_fi": "Ix3ugaeI_MY",
    "url_fi": "https://www.youtube.com/watch?v=Ix3ugaeI_MY",
    "topic_fi": "Okulaari"
  },
  {
    "id": "AGc87oSBf7s",
    "chapter": "10.12",
    "topic": "Microscope",
    "url": "https://www.youtube.com/watch?v=AGc87oSBf7s",
    "id_fi": "CK2SR2PC4M4",
    "url_fi": "https://www.youtube.com/watch?v=CK2SR2PC4M4",
    "topic_fi": "Mikroskooppi"
  },
  {
    "id": "H_tQ8I7Fhns",
    "chapter": "10.13",
    "topic": "Telescope",
    "url": "https://www.youtube.com/watch?v=H_tQ8I7Fhns",
    "id_fi": "GSkARKoRQOs",
    "url_fi": "https://www.youtube.com/watch?v=GSkARKoRQOs",
    "topic_fi": "Kaukoputki"
  }
];

// Merge in-video timestamp segments (by id and, where present, id_fi) onto
// each video entry. A video may have segments for one language, both, or
// neither, depending on what's been pasted via add_video_segments.js so far.
VIDEOS.forEach((v) => {
  if (SEGMENTS[v.id]) v.segments = SEGMENTS[v.id];
  if (v.id_fi && SEGMENTS[v.id_fi]) v.segments_fi = SEGMENTS[v.id_fi];
});

const BY_CHAPTER = {
  "2.1": ["YF0EGDxvILI"],
  "2.2": ["Hpst5RnWvWk"],
  "2.3": ["7_8dAL5p2Uo"],
  "3.1": ["67WIeeSZ8J8"],
  "3.2": ["G7LuVFfkgH4"],
  "3.3": ["pzzjQhhXdkE"],
  "3.4": ["FDyq6eIYGW4"],
  "3.5": ["dyMMYWWq61Q"],
  "3.6": ["Ve6Y_WjFSOc"],
  "3.7": ["_tcGbrTCQJk"],
  "3.8": ["Ake1joldkjQ"],
  "3.9": ["maSfD-56GyE"],
  "3.10": ["bH4obSrWKu0"],
  "3.11": ["GSxubtjbaGw"],
  "3.12": ["94iUDGD4Zds"],
  "4.1": ["qTUo4-5at-g"],
  "4.2": ["sQxY5lPnGqU"],
  "4.3": ["qPxBAoaT_Dc"],
  "4.4": ["oy_dKWcBdEU"],
  "4.5": ["2DzOMc2TNXg"],
  "4.6": ["UQhWzsds36Y"],
  "5.1": ["-M_cmF5Yr_0"],
  "5.2": ["zSxO_lvWLCo"],
  "5.3": ["OuJEnxBIMow"],
  "5.4": ["IjpJ9CPpNzY"],
  "6.1": ["f2zWQFZy3ro"],
  "6.2": ["rZpevBG15wM"],
  "6.3": ["v2xMj_Ln2CU"],
  "6.4": ["TY301VRuhws"],
  "6.5": ["v8EnoFFq8j4"],
  "6.6": ["nL2UDvMp8xY"],
  "7.1": ["RE2w02PdXPM"],
  "7.2": ["Vcyz3UGkx5g"],
  "7.3": ["QjukxExTOA4"],
  "7.4": ["Ccz-BpQwsgM"],
  "7.5": ["Ls8TMMR-Kbs"],
  "8.1": ["YZEzxidicM0"],
  "8.2": ["bV3V7lFjTbQ"],
  "8.3": ["vSeFezFqK8Y"],
  "8.4": ["lF1xY180co0"],
  "8.5": ["823Ks2ZCAOg"],
  "8.6": ["falbEurnJjk"],
  "8.7": ["vSVBASzmCT4"],
  "9.1": ["_mM8QYplWtE"],
  "9.2": ["JphaoWz52lQ"],
  "9.3": ["9sS4kmdQn9U"],
  "9.4": ["47SHcLXCT0E"],
  "9.5": ["0jrjMJzjIsA"],
  "10.1": ["WKIGee5ISaw"],
  "10.2": ["6eMo9rIPaw4"],
  "10.3": ["_P3oLukTFTE"],
  "10.4": ["mHaqg91mdqU"],
  "10.5": ["pSjhB-N4yOU"],
  "10.6": ["LsSDUs54BzA"],
  "10.7": ["XCxuW52jv-4"],
  "10.8": ["ZyEEYqvkbt4"],
  "10.9": ["uHOZb69Qcgo"],
  "10.10": ["ZzNvEyRSFEM"],
  "10.11": ["a0AGftBDXzI"],
  "10.12": ["AGc87oSBf7s"],
  "10.13": ["H_tQ8I7Fhns"]
};

const BY_TOPIC = {
  "amplitude-splitting": ["vSeFezFqK8Y"],
  "aperture": ["9sS4kmdQn9U"],
  "apertures": ["LsSDUs54BzA"],
  "approximation": ["94iUDGD4Zds"],
  "atom": ["OuJEnxBIMow"],
  "atoms": ["-M_cmF5Yr_0"],
  "basic": ["zSxO_lvWLCo", "_mM8QYplWtE", "9sS4kmdQn9U", "WKIGee5ISaw"],
  "calculus": ["GSxubtjbaGw"],
  "charge": ["sQxY5lPnGqU"],
  "coefficients": ["TY301VRuhws"],
  "coherence": ["Ls8TMMR-Kbs"],
  "combination": ["pSjhB-N4yOU"],
  "complex": ["Ve6Y_WjFSOc"],
  "conditions": ["YZEzxidicM0"],
  "conservation": ["sQxY5lPnGqU"],
  "cylindrical": ["maSfD-56GyE"],
  "definitions": ["WKIGee5ISaw"],
  "diffraction": ["_mM8QYplWtE", "JphaoWz52lQ", "9sS4kmdQn9U", "47SHcLXCT0E", "0jrjMJzjIsA"],
  "dipole": ["2DzOMc2TNXg"],
  "electromagnetic": ["YF0EGDxvILI", "qPxBAoaT_Dc", "oy_dKWcBdEU", "v2xMj_Ln2CU"],
  "electrostatic": ["94iUDGD4Zds"],
  "energy": ["qPxBAoaT_Dc"],
  "equation": ["G7LuVFfkgH4", "Ake1joldkjQ"],
  "equations": ["qTUo4-5at-g", "UQhWzsds36Y"],
  "eye": ["uHOZb69Qcgo"],
  "eyepiece": ["a0AGftBDXzI"],
  "fabry": ["falbEurnJjk", "vSVBASzmCT4"],
  "field": ["qPxBAoaT_Dc", "oy_dKWcBdEU"],
  "fields": ["bH4obSrWKu0"],
  "formation": ["mHaqg91mdqU"],
  "fraunhofer": ["JphaoWz52lQ"],
  "frequencies": ["Ccz-BpQwsgM"],
  "fresnel": ["TY301VRuhws"],
  "fronts": ["f2zWQFZy3ro"],
  "glass": ["ZzNvEyRSFEM"],
  "gratings": ["0jrjMJzjIsA"],
  "harmonic": ["pzzjQhhXdkE", "Vcyz3UGkx5g"],
  "human": ["uHOZb69Qcgo"],
  "image": ["mHaqg91mdqU"],
  "instruments": ["falbEurnJjk"],
  "interactions": ["zSxO_lvWLCo"],
  "interference": ["YZEzxidicM0", "823Ks2ZCAOg"],
  "interferometer": ["lF1xY180co0"],
  "interferometers": ["bV3V7lFjTbQ", "vSeFezFqK8Y"],
  "internal": ["nL2UDvMp8xY"],
  "lasing": ["IjpJ9CPpNzY"],
  "lenses": ["_P3oLukTFTE", "pSjhB-N4yOU"],
  "light": ["zSxO_lvWLCo"],
  "lorentz": ["OuJEnxBIMow"],
  "macroscopic": ["UQhWzsds36Y"],
  "magnifying": ["ZzNvEyRSFEM"],
  "matter": ["zSxO_lvWLCo"],
  "maxwells": ["qTUo4-5at-g", "UQhWzsds36Y"],
  "michelson": ["lF1xY180co0"],
  "microscope": ["AGc87oSBf7s"],
  "microscopic": ["qTUo4-5at-g"],
  "mirrors": ["XCxuW52jv-4"],
  "model": ["OuJEnxBIMow"],
  "molecules": ["-M_cmF5Yr_0"],
  "momentum": ["oy_dKWcBdEU"],
  "moving": ["67WIeeSZ8J8"],
  "multiple": ["47SHcLXCT0E"],
  "multiple-beam": ["823Ks2ZCAOg"],
  "particles": ["7_8dAL5p2Uo"],
  "perot": ["falbEurnJjk", "vSVBASzmCT4"],
  "perturbation": ["67WIeeSZ8J8"],
  "phase": ["FDyq6eIYGW4"],
  "phenomenology": ["rZpevBG15wM"],
  "plane": ["_tcGbrTCQJk"],
  "potentials": ["94iUDGD4Zds"],
  "pressure": ["oy_dKWcBdEU"],
  "principle": ["dyMMYWWq61Q", "IjpJ9CPpNzY", "RE2w02PdXPM"],
  "prisms": ["ZyEEYqvkbt4"],
  "radiation": ["oy_dKWcBdEU", "2DzOMc2TNXg", "-M_cmF5Yr_0"],
  "rays": ["Hpst5RnWvWk", "f2zWQFZy3ro"],
  "reflection": ["rZpevBG15wM", "v2xMj_Ln2CU", "nL2UDvMp8xY"],
  "reflectivity": ["v8EnoFFq8j4"],
  "refraction": ["v2xMj_Ln2CU", "6eMo9rIPaw4"],
  "representation": ["Ve6Y_WjFSOc"],
  "several": ["Ccz-BpQwsgM"],
  "shapes": ["9sS4kmdQn9U"],
  "slits": ["47SHcLXCT0E"],
  "space": ["Ake1joldkjQ"],
  "spectroscopy": ["vSVBASzmCT4"],
  "spherical": ["maSfD-56GyE", "6eMo9rIPaw4"],
  "standing": ["QjukxExTOA4"],
  "stops": ["LsSDUs54BzA"],
  "superposition": ["dyMMYWWq61Q", "RE2w02PdXPM", "Ccz-BpQwsgM"],
  "surface": ["6eMo9rIPaw4"],
  "telescope": ["H_tQ8I7Fhns"],
  "theory": ["v2xMj_Ln2CU", "_mM8QYplWtE"],
  "thin": ["_P3oLukTFTE"],
  "three-dimensional": ["Ake1joldkjQ"],
  "total": ["nL2UDvMp8xY"],
  "transmission": ["rZpevBG15wM"],
  "transmissivity": ["v8EnoFFq8j4"],
  "transverse": ["sQxY5lPnGqU"],
  "tutorial": ["GSxubtjbaGw"],
  "vector": ["bH4obSrWKu0", "GSxubtjbaGw"],
  "velocity": ["FDyq6eIYGW4"],
  "wave": ["G7LuVFfkgH4", "Ake1joldkjQ", "f2zWQFZy3ro"],
  "wavefront-splitting": ["bV3V7lFjTbQ"],
  "waves": ["YF0EGDxvILI", "pzzjQhhXdkE", "Ve6Y_WjFSOc", "_tcGbrTCQJk", "maSfD-56GyE", "sQxY5lPnGqU", "Vcyz3UGkx5g", "QjukxExTOA4"]
};

// --------------------------------------------------------------------------
// Fuzzy matching for findRelevantSegments(): does the deterministic
// question-to-timestamp matching in code instead of leaving a small model
// to scan the whole raw <video_lectures> dump and hope it finds the right
// line — much more reliable for short models like Haiku, and cheap.
//
// Finnish is agglutinative (case suffixes glue onto the stem: "yhtälöstä"
// for "yhtälö"), so plain equality would miss almost everything. Instead
// each query/label token pair scores via: exact match, or one token being
// a prefix of the other (min 4 chars, to catch "poissonin"~"poissonin",
// "yhtälöstä"~"yhtälö") without matching on short/common words.
const STOPWORDS = new Set([
  // Finnish question words / filler
  "mikä", "mitä", "miksi", "miten", "milloin", "missä", "mistä", "minne",
  "onko", "ovatko", "voitko", "voisitko", "kerro", "kertoa", "lisää",
  "minulle", "selitä", "selittää", "tämä", "tuo", "se", "että", "myös",
  "vielä", "ihan", "vain", "eli", "esim", "esimerkiksi", "kuin", "sekä",
  // English question words / filler
  "what", "how", "why", "when", "where", "does", "do", "is", "are", "the",
  "a", "an", "of", "in", "on", "for", "to", "about", "tell", "me", "more",
  "explain", "can", "you", "please", "i", "and", "or", "with",
]);

function tokenize(text) {
  return (text.toLowerCase().match(/[a-zà-öø-ÿ0-9]+/gi) || [])
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
}

function tokenScore(qTokens, labelTokens) {
  let score = 0;
  for (const qt of qTokens) {
    let best = 0;
    for (const lt of labelTokens) {
      if (qt === lt) { best = 2; break; }
      if (lt.length >= 4 && (qt.startsWith(lt) || lt.startsWith(qt))) best = Math.max(best, 1);
    }
    score += best;
  }
  return score;
}

module.exports = {
  course: {"code":"FYS.240","name":"Optics","finnish":"Optiikka","channel":"https://www.youtube.com/@fysiikkaakotisohvalle1510"},

  /**
   * Get all videos as array
   */
  all() {
    return VIDEOS;
  },

  /**
   * Get video by ID
   * @param {string} videoId - YouTube video ID
   * @returns {Object|null}
   */
  getVideo(videoId) {
    return VIDEOS.find(v => v.id === videoId || v.id_fi === videoId) || null;
  },

  /**
   * Get all videos in a chapter
   * @param {string} chapter - Chapter number (e.g., "10.1")
   * @returns {Array}
   */
  getChapter(chapter) {
    const ids = BY_CHAPTER[chapter] || [];
    return VIDEOS.filter(v => ids.includes(v.id));
  },

  /**
   * Search videos by topic keyword (matches English or Finnish title)
   * @param {string} keyword - Search keyword
   * @returns {Array} Matching videos sorted by chapter
   */
  search(keyword) {
    const lower = keyword.toLowerCase();
    const results = VIDEOS.filter(v =>
      v.topic.toLowerCase().includes(lower) ||
      (v.topic_fi && v.topic_fi.toLowerCase().includes(lower))
    );
    return results;
  },

  /**
   * Get chapters list
   * @returns {Array} Sorted array of chapter numbers
   */
  getChapters() {
    // Sort by major.minor as two separate integers, not as a single float —
    // parseFloat("3.10") === parseFloat("3.1") === 3.1, which would misorder
    // e.g. "3.10" right next to "3.1" instead of after "3.9".
    return Object.keys(BY_CHAPTER).sort((a, b) => {
      const [aMajor, aMinor] = a.split('.').map(Number);
      const [bMajor, bMinor] = b.split('.').map(Number);
      if (aMajor !== bMajor) return aMajor - bMajor;
      return (aMinor || 0) - (bMinor || 0);
    });
  },

  /**
   * Get quick topic summary for bot responses
   * @param {string} topic - Topic to find
   * @returns {Object|null} {chapter, topic, url, segment?}
   */
  findBestMatch(topic) {
    const lower = topic.toLowerCase();

    // Exact or partial match in topic name
    let match = VIDEOS.find(v =>
      v.topic.toLowerCase().includes(lower)
    );

    // Try keyword search
    if (!match) {
      const keywords = lower.split(/\s+/);
      for (const keyword of keywords) {
        match = VIDEOS.find(v =>
          v.topic.toLowerCase().includes(keyword)
        );
        if (match) break;
      }
    }

    if (!match) return null;

    // If an in-video timestamp matches even more precisely (same lecture,
    // more specific label), attach it so callers can link straight to that
    // moment instead of the start of the video.
    const segmentHits = this.findSegment(topic);
    const bestSegment = segmentHits.find(s => s.chapter === match.chapter);
    return bestSegment ? { ...match, segment: bestSegment } : match;
  },

  /**
   * Search in-video timestamp segments (chapter markers) for a keyword.
   * More precise than findBestMatch(): points at the exact moment a
   * sub-topic is discussed, not just the start of the lecture video.
   * Requires segments added via add_video_segments.js — videos without
   * any pasted timestamps simply won't turn up here.
   * @param {string} keyword
   * @returns {Array} [{chapter, topic, id, lang, t, label, url}], most
   *   specific (shortest matching label) first
   */
  findSegment(keyword) {
    const lower = keyword.toLowerCase();
    const hits = [];
    VIDEOS.forEach(v => {
      (v.segments || []).forEach(s => {
        if (s.label.toLowerCase().includes(lower)) {
          hits.push({
            chapter: v.chapter, topic: v.topic, id: v.id, lang: 'en',
            t: s.t, label: s.label,
            url: `https://www.youtube.com/watch?v=${v.id}&t=${s.t}s`,
          });
        }
      });
      (v.segments_fi || []).forEach(s => {
        if (s.label.toLowerCase().includes(lower)) {
          hits.push({
            chapter: v.chapter, topic: v.topic, id: v.id_fi, lang: 'fi',
            t: s.t, label: s.label,
            url: `https://www.youtube.com/watch?v=${v.id_fi}&t=${s.t}s`,
          });
        }
      });
    });
    hits.sort((a, b) => a.label.length - b.label.length);
    return hits;
  },

  /**
   * Rank in-video timestamp segments against a free-text question, using
   * fuzzy (Finnish-suffix-tolerant) token overlap instead of a plain
   * substring check. Use this to hand a small, pre-matched set of
   * candidates to the model instead of making it search the full
   * <video_lectures> dump itself.
   * @param {string} question - the student's raw question, any language
   * @param {number} [maxResults=3]
   * @returns {Array} [{chapter, topic, id, lang, t, label, url, score}],
   *   best match first; empty if nothing scores above 0
   */
  findRelevantSegments(question, maxResults = 3) {
    const qTokens = tokenize(question);
    if (qTokens.length === 0) return [];

    const hits = [];
    VIDEOS.forEach(v => {
      (v.segments || []).forEach(s => {
        const score = tokenScore(qTokens, tokenize(s.label));
        if (score > 0) {
          hits.push({
            chapter: v.chapter, topic: v.topic, id: v.id, lang: 'en',
            t: s.t, label: s.label, score,
            url: `https://www.youtube.com/watch?v=${v.id}&t=${s.t}s`,
          });
        }
      });
      (v.segments_fi || []).forEach(s => {
        const score = tokenScore(qTokens, tokenize(s.label));
        if (score > 0) {
          hits.push({
            chapter: v.chapter, topic: v.topic, id: v.id_fi, lang: 'fi',
            t: s.t, label: s.label, score,
            url: `https://www.youtube.com/watch?v=${v.id_fi}&t=${s.t}s`,
          });
        }
      });
    });

    // Best score first; among ties, the more specific (shorter) label first.
    hits.sort((a, b) => b.score - a.score || a.label.length - b.label.length);
    return hits.slice(0, maxResults);
  },

  /**
   * Get the raw timestamp segments for a video, by its id or id_fi.
   * @param {string} videoId
   * @returns {Array} [{t, label}]
   */
  getSegments(videoId) {
    const v = VIDEOS.find(v => v.id === videoId || v.id_fi === videoId);
    if (!v) return [];
    return v.id === videoId ? (v.segments || []) : (v.segments_fi || []);
  },

  /**
   * Get all unique topics
   * @returns {Array}
   */
  getTopics() {
    return VIDEOS.map(v => v.topic);
  }
};
