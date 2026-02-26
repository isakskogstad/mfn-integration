# MFN Pressmeddelanden: Extraktion av strukturerad data

Denna dokumentation beskriver alla HTML-mönster och extraktionsstrategier som
används i `lib/mfn-api.ts` (funktionen `extractMfnContent`) för att parsa
strukturerad data ur MFN-pressmeddelanden.

Källfil: `lib/mfn-api.ts`, rad 1007-1297.

---

## 1. HTML-struktur

MFN-pressmeddelanden levereras som HTML i fältet `content.html` på varje
nyhetsobjekt. HTML:en följer en konsekvent klassstruktur med semantiska
CSS-klasser som identifierar varje sektion.

### Övergripande layout

```html
<!-- Ingress / sammanfattning -->
<div class="mfn-preamble">
  Sammanfattande text (samma innehåll som content.preamble i JSON)
</div>

<!-- Artikelkropp -->
<div class="mfn-body">
  <strong class="mfn-heading-1">Huvudrubrik</strong>
  <p>Brödtext...</p>
  <strong class="mfn-heading-2">Underrubrik</strong>
  <p>Mer text...</p>
</div>

<!-- Footer-sektioner (0 eller fler, ordningen varierar) -->
<div class="mfn-footer mfn-contacts ...">Kontaktinformation</div>
<div class="mfn-footer mfn-about ...">Om bolaget</div>
<div class="mfn-footer mfn-regulatory mfn-regulatory-mar">MAR-information</div>
<div class="mfn-footer mfn-attachment-general">PDF-bilagor</div>
<div class="mfn-footer mfn-attachment-image">Bildbilagor</div>
```

### CSS-klasser i detalj

| Klass                               | Beskrivning                                                                                                                                         | Förekomst                       |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `mfn-preamble`                      | Ingress/sammanfattning. Innehållet speglar `content.preamble` i JSON-svaret.                                                                        | Alltid                          |
| `mfn-body`                          | Huvudsakligt artikelinnehåll med brödtext, listor, tabeller m.m.                                                                                    | Alltid                          |
| `mfn-heading-1`                     | Huvudrubrik inom artikelkroppen. Används som `<strong>`-element.                                                                                    | Vanlig                          |
| `mfn-heading-2`                     | Underrubrik inom artikelkroppen. Används som `<strong>`-element.                                                                                    | Vanlig                          |
| `mfn-footer mfn-contacts`           | Strukturerad kontaktinformation. Kan ha ytterligare hash-klass.                                                                                     | Vanlig (ca 60% av bolag)        |
| `mfn-footer mfn-about`              | Bolagsbeskrivning ("Om bolaget"). Kan ha ytterligare hash-klass.                                                                                    | Vanlig                          |
| `mfn-footer mfn-regulatory`         | Regulatorisk information (generell).                                                                                                                | Ovanlig                         |
| `mfn-footer mfn-regulatory-mar`     | MAR-specifik regulatorisk information med offentliggörandetidpunkt.                                                                                 | Vanlig för regulatoriska PM     |
| `mfn-footer mfn-attachment-general` | PDF-bilagor (rapporter, presentationer).                                                                                                            | Vanlig                          |
| `mfn-footer mfn-attachment-image`   | Bildbilagor (foton, illustrationer).                                                                                                                | Mindre vanlig                   |
| `mfn-footer mfn-{hash}`             | Generisk footer med bolagsspecifik hash-klass (hexadecimalt). Kan innehålla kontakter, bolagsbeskrivning eller annan information beroende på bolag. | Vanlig (Climeon, Hexicon m.fl.) |

**Viktigt om hash-klasser:** Många bolag använder `mfn-footer mfn-{hash}` istället
för de semantiska klasserna `mfn-contacts` och `mfn-about`. Hash-värdet är unikt
per bolag och oförutsägbart. Extraktionslogiken måste därför falla tillbaka på
innehållsanalys (nyckelord) för att identifiera vilken typ av footer det rör sig om.

---

## 2. Kontaktextraktion

Kontaktinformation extraheras i två steg:

1. **Lokalisering** -- Hitta HTML-blocket som innehåller kontaktuppgifter (4 strategier)
2. **Parsning** -- Tolka textinnehållet till strukturerade kontaktobjekt (4 mönster)

### Resultattyp

```typescript
interface MfnContact {
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
}
```

### Steg 1: Lokaliseringsstrategier

Strategierna provas i prioritetsordning. Den första som matchar används.

#### Strategi 1: `mfn-footer mfn-contacts` (strukturerad)

Den mest pålitliga varianten. Footern har den explicita klassen `mfn-contacts`.

**Regex:**

```typescript
/<div class="mfn-footer mfn-contacts[^"]*">([\s\S]*?)<\/div>\s*(?:\n<div|$)/;
```

**Bolag som använder detta:** Egetis, BioInvent, ALM Equity, de flesta Large/Mid Cap-bolag.

**Exempel (Egetis):**

```html
<div class="mfn-footer mfn-contacts mfn-a1b2c3">
  <p><strong>För ytterligare information, vänligen kontakta:</strong></p>
  <p>
    Nicklas Westerholm, vd<br />
    nicklas.westerholm@egetis.com<br />
    +46 (0) 733 542 062
  </p>
</div>
```

#### Strategi 2: Generisk `mfn-footer` med hash innehållande kontaktnyckelord

Footern har en hash-klass (`mfn-{hex}`) men inget semantiskt klassnamn. Identifieras
genom att textinnehållet matchar kontaktrelaterade nyckelord.

**Regex:**

```typescript
/<div class="mfn-footer mfn-[a-f0-9]+">[^]*?(?:CONTACT|kontakta|INFORMATION)[^]*?<\/div>/i;
```

**Bolag som använder detta:** Climeon, Hexicon, flera First North-bolag.

**Exempel (Climeon):**

```html
<div class="mfn-footer mfn-8f3a2e">
  <p><strong>FOR MORE INFORMATION, PLEASE CONTACT:</strong></p>
  <p>
    Lena Sundquist, CEO<br />
    lena.sundquist@climeon.com<br />
    +46 708 345 228
  </p>
</div>
```

#### Strategi 3: Bar `mfn-footer` med kontaktnyckelord

Footern saknar helt underklasser (varken semantisk eller hash). Identifieras genom
att texten börjar med en avdelningskategori eller kontaktnyckelord.

**Regex:**

```typescript
/<div class="mfn-footer">\s*(?:<p>)?\s*(?:<span>)*\s*(?:<span>)*\s*(?:<strong>)?\s*(?:Mediakontakt|Företagskontakt|Investor Relations|Pressansvarig|Press\s*contact|Media\s*contact|CONTACT|kontakta|INFORMATION)[\s\S]*?<\/div>/i;
```

**Bolag som använder detta:** Sivers Semiconductors.

**Exempel (Sivers):**

```html
<div class="mfn-footer">
  <p><strong>Mediakontakt</strong></p>
  <p>
    Anders Storm<br />
    CEO<br />
    +46 70 262 6390<br />
    anders.storm@sivers-semiconductors.com
  </p>
</div>
```

#### Strategi 4: Inline i artikelkroppen

Inga footer-element alls -- kontaktinformationen finns direkt i brödtexten,
introducerad av ett `<strong>`-element vars text innehåller "kontakt" eller "contact".
Hanterar även nästlade `<span>`-element inuti `<strong>`.

**Regex:**

```typescript
/<strong[^>]*>(?:<[^>]+>)*[^<]*(?:kontakt[a-z]*|(?:please )?contact)[^]*?<\/strong>(?:<\/p>)?\s*([\s\S]*?)(?:<div class="mfn-footer|<strong[^>]*class="mfn-heading|$)/i;
```

**Bolag som använder detta:** Nattaro Labs.

**Exempel (Nattaro Labs):**

```html
<div class="mfn-body">
  ...
  <p>
    <strong
      ><span>För ytterligare information, vänligen kontakta:</span></strong
    >
  </p>
  <p>
    Fredrik Trulsson<br />
    Verkställande direktör, Nattaro Labs AB<br />
    +46-73 517 58 33<br />
    fredrik.trulsson@nattarolabs.com
  </p>
</div>
```

### Steg 2: Parsningsmönster

Efter att HTML-blocket har lokaliserats strippas all HTML och texten delas upp
i rader. Följande hjälpfunktioner och regex används genomgående:

```typescript
// E-post-validering (accepterar även "Email:"-prefix)
const emailRe = /^(?:E-?mail:\s*)?[\w.+-]+@[\w.-]+\.\w+$/i;

// Telefonnummer-validering (accepterar "Phone:"/"Tel:"-prefix)
const phoneRe = /^(?:Phone:\s*|Tel(?:efon)?:\s*)?[+0][\s()\d-]{7,}/i;

// Extrahera ren e-postadress ur en sträng
const extractEmail = (s: string) => {
  const m = s.match(/([\w.+-]+@[\w.-]+\.\w+)/);
  return m ? m[1] : s;
};

// Rensa bort prefix från telefonnummer
const extractPhone = (s: string) =>
  s.replace(/^(?:Phone|Tel(?:efon)?):\s*/i, "").trim();
```

Varje rad spåras via ett `consumed`-set för att undvika att samma rad parsas
av flera mönster.

#### Mönster A: "Namn, Titel" (vanligast)

Matchar rader i formatet `Förnamn Efternamn, Titel` med valfri inline
e-post/telefon (Flat Capital-stil) eller e-post/telefon på efterföljande rader.

**Regex för radmatchning:**

```typescript
/^([A-ZÅÄÖÉÈÊ][\wéèêåäö\s.-]{1,50}),\s*(.+?)$/;
```

**Max radlängd:** 200 tecken (längre rader anses vara prosa, inte kontaktinfo).

**Max namn-längd:** 50 tecken (inbyggt i regex-mönstret).

**Framåtblick (lookahead):** Upp till 5 rader framåt söks efter e-post och telefonnummer.
Sökningen avbryts om en rad som börjar med versal och inte är e-post/telefon påträffas
(antas vara nästa person).

**Bolag:** Egetis, Climeon, BioInvent, ALM Equity, Flat Capital.

**Exempel (standardformat):**

```
Nicklas Westerholm, vd
nicklas.westerholm@egetis.com
+46 (0) 733 542 062
```

Resultat: `{ name: "Nicklas Westerholm", role: "vd", email: "nicklas.westerholm@egetis.com", phone: "+46 (0) 733 542 062" }`

**Exempel (Flat Capital -- allt inline):**

```
Birgitta Henriksson, CFO, birgitta@flatcapital.com, +46 70 123 45 67
```

Resultat: `{ name: "Birgitta Henriksson", role: "CFO", email: "birgitta@flatcapital.com", phone: "+46 70 123 45 67" }`

#### Mönster B: Avdelning/kategori

Matchar rader som börjar med en avdelningsbenämning, följt av namn, titel,
telefon och e-post på efterföljande rader.

**Regex för kategoridetektion:**

```typescript
/^(?:Mediakontakt|Företagskontakt|Investor Relations|Pressansvarig|Press\s*contact|Media\s*contact|Communications?\s*Department)/i;
```

**Regex för titelvalidering (efterföljande rader):**

```typescript
/^(?:CEO|CFO|CTO|COO|VD|VP|Head|Chief|Director|Chef|Kommunikation|Finans)/i;
```

**Framåtblick:** Upp till 5 rader framåt. Sökningen avbryts om en ny avdelningsrad
påträffas.

**Bolag:** Sivers Semiconductors.

**Exempel (Sivers):**

```
Mediakontakt
Anders Storm
CEO
+46 70 262 6390
anders.storm@sivers-semiconductors.com
```

Resultat: `{ name: "Anders Storm", role: "CEO", email: "anders.storm@sivers-semiconductors.com", phone: "+46 70 262 6390" }`

**Fallback:** Om inget namn hittas men e-post finns, används avdelningsnamnet
som `name` och `role`.

#### Mönster C: Namn + Titel (Nattaro-stil)

Matchar när ett namn står ensamt på en rad, direkt följt av en titelrad
(identifierad via titelrelaterade nyckelord).

**Regex för namnrad:**

```typescript
/^[A-ZÅÄÖÉÈÊ][\wéèêåäö\s.-]+$/;
```

**Regex för titelvalidering:**

```typescript
/(?:VD|CEO|CFO|CTO|COO|VP|Head|Chief|Director|Chef|direktör|ansvarig|ordförande|Chairman|Manager|Officer|Investor|Communications|IR\b)/i;
```

**Framåtblick:** Upp till 3 rader framåt (från rad efter titeln) för e-post
och telefon.

**Bolag:** Nattaro Labs.

**Exempel (Nattaro Labs):**

```
Fredrik Trulsson
Verkställande direktör, Nattaro Labs AB
+46-73 517 58 33
fredrik.trulsson@nattarolabs.com
```

Resultat: `{ name: "Fredrik Trulsson", role: "Verkställande direktör, Nattaro Labs AB", email: "fredrik.trulsson@nattarolabs.com", phone: "+46-73 517 58 33" }`

#### Mönster D: Fristående namn/avdelning + e-post (Hexicon-stil)

Det enklaste mönstret: en rad med text (som börjar med versal och inte är
e-post/telefon) direkt följd av en e-postrad.

**Villkor:**

- Raden börjar med `[A-ZÅÄÖÉÈÊ]`
- Raden är inte e-post eller telefon
- Nästa rad **är** en giltig e-postadress

**Valfri framåtblick:** 1 extra rad för telefonnummer.

**Bolag:** Hexicon.

**Exempel (Hexicon):**

```
Hexicon's Communications Department
communications@hexicongroup.com
```

Resultat: `{ name: "Hexicon's Communications Department", role: null, email: "communications@hexicongroup.com", phone: null }`

---

## 3. Bolagsbeskrivning (About Company)

Bolagsbeskrivningen extraheras i två steg med fallback.

### Primär: `mfn-footer mfn-about`

```typescript
/<div class="mfn-footer mfn-about[^"]*">([\s\S]*?)<\/div>/;
```

Matchar footer med den explicita klassen `mfn-about`. Kan ha ytterligare
hash-klass (t.ex. `mfn-about mfn-4a7b2c`).

**Exempel (BioInvent):**

```html
<div class="mfn-footer mfn-about mfn-d3e5f7">
  <p><strong>Om BioInvent</strong></p>
  <p>
    BioInvent International AB är ett forskningsbaserat biofarmaceutiskt företag
    med fokus på framtagning och utveckling av innovativa antikroppsläkemedel...
  </p>
</div>
```

### Fallback: Hash-footer med "Om " eller "About "

```typescript
/<div class="mfn-footer mfn-[a-f0-9]+">\s*(?:<p>)?\s*(?:<strong[^>]*>)?\s*(?:Om |About )[^]*?<\/div>/i;
```

Matchar vilken generisk hash-footer som helst vars text börjar med "Om " eller
"About " (typiskt "Om {Bolagsnamn}" eller "About {CompanyName}").

**Resultattyp:** `string | null` -- all HTML strippas och texten trimmas.

---

## 4. Regulatorisk information

### CSS-klass

```typescript
/<div class="mfn-footer mfn-regulatory[^"]*">([\s\S]*?)<\/div>/;
```

Matchar `mfn-regulatory` samt den mer specifika `mfn-regulatory-mar`.

### Innehåll

Regulatoriska footer-sektioner innehåller MAR-information (Market Abuse Regulation)
med exakt tidpunkt för offentliggörande.

**Typisk text (svenska):**

```
Informationen i detta pressmeddelande är sådan information som
[Bolagsnamn] är skyldigt att offentliggöra enligt EU:s
marknadsmissbruksförordning (MAR). Informationen lämnades,
genom ovanstående kontaktpersons försorg, för offentliggörande
den 2026-02-15 08:30 CET.
```

**Typisk text (engelska):**

```
This information is information that [CompanyName] is obliged to
make public pursuant to the EU Market Abuse Regulation. The
information was submitted for publication, through the agency
of the contact person set out above, at 08:30 CET on
February 15, 2026.
```

**Resultattyp:** `string | null` -- HTML strippas.

---

## 5. Certified Adviser

Relevant för bolag noterade på First North, Spotlight och Nordic SME som
har krav på Certified Adviser.

### Extraktionsmetod

Textbaserad sökning (inte HTML-klassbaserad) efter rubriken "Certified Adviser:"
i den strippade HTML-texten.

```typescript
const caMatch = text.match(
  /Certified Adviser[:\s]*\n(.*?)(?=\n\n|Om |About |$)/is
);
```

**Mönstret fångar:** All text efter "Certified Adviser:" fram till nästa dubbla
radbrytning eller en "Om "/"About "-rubrik (som indikerar bolagsbeskrivningen).

**Exempel:**

```
Certified Adviser:
FNCA Sweden AB, info@fnca.se, +46 8 528 00 399
```

Resultat: `"FNCA Sweden AB, info@fnca.se, +46 8 528 00 399"`

**Resultattyp:** `string | null`.

---

## 6. Sektioner

Sektioner extraheras från rubrikelement i HTML:en (`mfn-heading-1` och
`mfn-heading-2`).

### Extraktionslogik

HTML:en delas med `<strong class="mfn-heading-[12]">` som avgränsare.
Varje del parsas för:

1. **Rubrik:** Texten fram till `</strong>`.
2. **Brödtext:** All text efter `</strong>` fram till nästa rubrik eller footer.

```typescript
const headingParts = html.split(/<strong class="mfn-heading-[12]">/);
for (let i = 1; i < headingParts.length; i++) {
  const endTag = headingParts[i].indexOf("</strong>");
  const heading = headingParts[i].substring(0, endTag).trim();
  const rest = headingParts[i].substring(endTag);
  const sectionEnd = rest.search(
    /<strong class="mfn-heading|<div class="mfn-footer/
  );
  const sectionHtml = sectionEnd > 0 ? rest.substring(0, sectionEnd) : rest;
  // ...
}
```

### Vanliga rubriker

**Svenska:**

- "Perioden januari-mars YYYY" / "april-juni" / "juli-september" / "oktober-december"
- "Kassaflödesanalys"
- "Väsentliga händelser under kvartalet"
- "Väsentliga händelser efter kvartalets utgång"
- "Investeringar och avyttringar under kvartalet"
- "Övriga händelser"
- "Länk till rapporten på hemsidan:"
- "VD har ordet" / "VD-kommentar"
- "Utsikter" / "Framtidsutsikter"

**Engelska:**

- "Period January-March YYYY"
- "CEO comment"
- "Significant events during the quarter"
- "Events after the end of the period"
- "Outlook"
- "Financial summary"

**Resultattyp:** `{ heading: string; text: string }[]`

---

## 7. Kända problem och lösningar

### Falska positiver (false positive prevention)

**Radlängdsbegränsning:** I Mönster A begränsas raden till max 200 tecken.
Längre rader antas vara brödtext, inte kontaktuppgifter.

```typescript
const nameTitle =
  lines[i].length <= 200
    ? lines[i].match(/^([A-ZÅÄÖÉÈÊ][\wéèêåäö\s.-]{1,50}),\s*(.+?)$/)
    : null;
```

**Namnlängdsbegränsning:** Namn begränsas till 50 tecken via regex
(`{1,50}` i capture-gruppen), vilket förhindrar att långa meningar
med kommatecken felaktigt tolkas som "Namn, Titel".

### Separatorrader

Rader som bara består av upprepade bindestreck (`---...`) eller understreck
(`___...`) filtreras bort:

```typescript
l !== "-".repeat(l.length) && l !== "_".repeat(l.length);
```

### Kontaktintro-rader

Standardfraser som introducerar kontaktblocket filtreras bort och behandlas
inte som kontaktdata:

```typescript
!/^(?:FOR MORE|För (?:mer|ytterligare|vidare)|KONTAKT|Contact)/i.test(l);
```

### Bara "Email:"-etiketter

Vissa bolag har "Email:" eller "Phone:" som fristående rader (etiketten
på en rad, värdet på nästa). Mönster A hanterar detta genom att hoppa
över sådana etiketter i lookahead-loopen:

```typescript
if (/^(?:E-?mail|Phone|Tel):\s*$/i.test(lines[j])) {
  continue; // Bara etikett — hoppa över, värdet kommer på nästa rad
}
```

### Nästlad HTML inuti `<strong>`

Nattaro Labs och andra bolag nästlar `<span>` inuti `<strong>` för
kontaktrubriker. Strategi 4 hanterar detta med `(?:<[^>]+>)*` som
matchar valfritt antal nästlade HTML-element:

```typescript
/<strong[^>]*>(?:<[^>]+>)*[^<]*(?:kontakt[a-z]*|(?:please )?contact)[^]*?<\/strong>/i;
```

### Bolag med icke-standardiserade format

| Bolag            | Problem                                                                                                                              | Lösning                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| **Flat Capital** | All kontaktinfo (namn, titel, e-post, telefon) på en enda rad separerad med komma                                                    | Mönster A:s inline-extraktion av e-post/telefon ur "titel"-delen |
| **Climeon**      | Hash-klass istället för `mfn-contacts`, engelska nyckelord                                                                           | Strategi 2 med case-insensitiv matchning av "CONTACT"            |
| **Egetis**       | Standard `mfn-contacts`-klass                                                                                                        | Strategi 1 (bästa fallet)                                        |
| **Sivers**       | Bar `mfn-footer` utan underklasser, avdelningskategorier (Mediakontakt)                                                              | Strategi 3 + Mönster B                                           |
| **ALM Equity**   | Standard `mfn-contacts` med flera kontaktpersoner                                                                                    | Strategi 1 + Mönster A med lookahead                             |
| **BioInvent**    | Standard `mfn-contacts` + `mfn-about`                                                                                                | Strategi 1 + Mönster A                                           |
| **Nattaro Labs** | Ingen footer alls -- kontaktinfo inline i brödtext, nästlad `<span>` inuti `<strong>`, omvänd ordning (namn, titel, telefon, e-post) | Strategi 4 + Mönster C                                           |
| **Hexicon**      | Hash-klass, avdelningsnamn som kontaktnamn, ingen personlig titel                                                                    | Strategi 2 + Mönster D                                           |

### HTML-stripping

All HTML konverteras till ren text med en enkel stripping-funktion:

```typescript
const stripHtml = (s: string) =>
  s
    .replace(/<[^>]+>/g, "\n") // Ersätt HTML-taggar med radbrytning
    .replace(/&amp;/g, "&") // Avkoda HTML-entiteter
    .replace(/\n{3,}/g, "\n\n") // Begränsa konsekutiva radbrytningar
    .trim();
```

Observera att `<br>`, `<br/>`, `<p>`, `</p>` m.fl. alla ersätts med
radbrytningar, vilket gör att den efterföljande parsningen kan arbeta
rad-för-rad.

---

## Komplett API-referens

Funktionen `extractMfnContent(html: string)` returnerar:

```typescript
interface MfnExtractedContent {
  contacts: MfnContact[]; // Extraherade kontaktpersoner
  aboutCompany: string | null; // Bolagsbeskrivning
  certifiedAdviser: string | null; // Certified Adviser-info
  regulatoryDisclosure: string | null; // MAR-information
  sections: { heading: string; text: string }[]; // Rubriker + text
}
```

Anrop:

```typescript
import { extractMfnContent } from "@/lib/mfn-api";

const result = extractMfnContent(newsItem.content.html);
console.log(result.contacts); // [{name, role, email, phone}, ...]
console.log(result.aboutCompany); // "BioInvent International AB är..."
console.log(result.certifiedAdviser); // "FNCA Sweden AB, info@fnca.se, ..."
console.log(result.regulatoryDisclosure); // "Informationen i detta..."
console.log(result.sections); // [{heading: "VD har ordet", text: "..."}]
```
