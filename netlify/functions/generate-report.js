const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");
const { createClient } = require("@supabase/supabase-js");

const COLORS = {
  black: "#070707",
  carbon: "#111214",
  gold: "#C9A253",
  gold2: "#E3BE6A",
  ivory: "#F5F4F1",
  text: "#1A1A1A",
  muted: "#747474",
  light: "#F3F1EC",
  line: "#D8D3CA",
  white: "#FFFFFF"
};

function safe(v, fallback = "Non renseigne") {
  return v === undefined || v === null || v === "" ? fallback : String(v);
}

function forgeLevel(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return "NON DISPONIBLE";
  if (n >= 85) return "INVESTISSEUR";
  if (n >= 70) return "PROPRIETAIRE";
  if (n >= 55) return "BATISSEUR";
  if (n >= 40) return "OPERATEUR";
  return "PRISONNIER";
}

function indicatorBand(score, inverse = false) {
  const n = Number(score);
  if (!Number.isFinite(n)) return "NON DISPONIBLE";
  if (inverse) {
    if (n >= 80) return "CRITIQUE";
    if (n >= 60) return "ELEVE";
    if (n >= 40) return "SIGNIFICATIF";
    if (n >= 20) return "MODERE";
    return "FAIBLE";
  }
  if (n >= 85) return "EXCELLENT";
  if (n >= 70) return "SOLIDE";
  if (n >= 55) return "STRUCTURE";
  if (n >= 40) return "FRAGILE";
  if (n >= 20) return "FAIBLE";
  return "TRES FAIBLE";
}

function overallInsight(scores) {
  const forge = Number(scores.forge_score ?? 0);
  const dep = Number(scores.dependency_index ?? 0);
  const pred = Number(scores.predictability_index ?? 0);
  const asset = Number(scores.asset_index ?? 0);
  const frag = Number(scores.fragility_index ?? 0);

  if (forge < 40 && dep >= 70 && frag >= 70) {
    return "Votre entreprise genere de l activite, mais sa capacite a fonctionner sans le dirigeant reste faible. Avec une dependance et une fragilite elevees, la croissance peut augmenter la charge du dirigeant plus vite que la valeur de l entreprise. La priorite est donc de securiser le systeme avant d accelerer.";
  }
  if (dep >= 70) {
    return "La dependance au dirigeant est aujourd hui le signal le plus structurant. Tant que les decisions, la vente ou le pilotage restent fortement attaches a une personne, l entreprise demeure difficile a rendre autonome, scalable et transmissible.";
  }
  if (frag >= 70) {
    return "Le diagnostic revele plusieurs points uniques de defaillance. Une entreprise peut etre rentable tout en restant fragile : l enjeu est de securiser les relais, le savoir et les mecanismes critiques avant d augmenter la complexite.";
  }
  if (pred < 50) {
    return "La previsibilite reste insuffisante pour piloter sereinement les 90 prochains jours. L enjeu est de rendre acquisition, pipeline, ventes et pilotage plus mesurables afin de reduire le pilotage a vue.";
  }
  if (asset < 50) {
    return "L entreprise fonctionne, mais une partie de sa valeur structurelle reste encore attachee a des personnes plutot qu a des systemes. Le prochain niveau consiste a transformer davantage de savoir, de decisions et de ventes en actifs transmissibles.";
  }
  return "Votre entreprise dispose de bases structurelles solides. Le prochain enjeu consiste a augmenter simultanement autonomie, previsibilite et valeur d actif sans recreer de dependance au dirigeant.";
}

function businessConsequences(scores) {
  const dep = Number(scores.dependency_index ?? 0);
  const pred = Number(scores.predictability_index ?? 0);
  const asset = Number(scores.asset_index ?? 0);
  const frag = Number(scores.fragility_index ?? 0);
  const items = [];
  if (dep >= 60) items.push("Scalabilite limitee : davantage de croissance peut entrainer davantage de sollicitations du dirigeant.");
  if (frag >= 60) items.push("Risque operationnel : une absence, un depart ou un incident peut affecter plusieurs fonctions critiques.");
  if (pred < 50) items.push("Previsibilite faible : chiffre d affaires, ressources et decisions restent plus difficiles a anticiper.");
  if (asset < 50) items.push("Valeur d actif reduite : une partie du savoir et de la performance reste attachee aux personnes plutot qu au systeme.");
  return items.slice(0, 3);
}

function consequenceFor(code) {
  const map = {
    FOUNDER_CRITICAL: "Cette configuration peut limiter la capacite du dirigeant a se concentrer sur la strategie, ralentir les decisions et rendre la croissance plus couteuse en energie.",
    NO_SECOND_IN_COMMAND: "Sans relais de pilotage, l'absence du dirigeant peut rapidement devenir un risque operationnel et ralentir la prise de decision.",
    FOUNDER_FIREFIGHTER: "Le mode pompier entretient la dependance, fragilise la priorisation et reduit le temps consacre aux sujets a fort effet de levier.",
    KEY_PERSON_RISK: "Une personne cle peut devenir un point unique de defaillance et compliquer la continuite d'activite, l'onboarding ou la transmission.",
    KNOWLEDGE_NOT_SYSTEMIZED: "Un savoir non formalise reste difficile a deleguer, a automatiser et a transmettre. Il limite directement l'autonomie de l'organisation.",
    ACQUISITION_DEPENDENCY: "Une acquisition peu reproductible rend le chiffre d'affaires plus difficile a anticiper et augmente la pression commerciale sur le dirigeant.",
    FOUNDER_LED_SALES: "Lorsque le fondateur reste indispensable a la vente, la croissance commerciale reste mecaniquement liee a sa disponibilite.",
    LOW_VISIBILITY: "Un pilotage insuffisamment visible rend les arbitrages plus reactifs et limite la capacite a anticiper les besoins de tresorerie, de recrutement ou de production.",
    MARGIN_BLINDNESS: "Une lecture insuffisante de la marge peut conduire a developper des activites qui consomment beaucoup de ressources sans creer suffisamment de valeur."
  };
  return map[code] || "Ce point peut limiter l'autonomie, la previsibilite ou la capacite de l'entreprise a absorber sa croissance.";
}

function questionFor(code) {
  const map = {
    FOUNDER_CRITICAL: "Quelles decisions reviennent encore systematiquement jusqu'a vous - et pourquoi ?",
    NO_SECOND_IN_COMMAND: "Qui pourrait aujourd'hui reprendre le pilotage pendant deux semaines sans vous ?",
    FOUNDER_FIREFIGHTER: "Quels sont les trois problemes qui reviennent le plus souvent jusqu'a vous ?",
    KEY_PERSON_RISK: "Que se passerait-il si cette personne cle etait absente demain pendant un mois ?",
    KNOWLEDGE_NOT_SYSTEMIZED: "Quel savoir critique n'existe encore que dans la tete d'une personne ?",
    ACQUISITION_DEPENDENCY: "Si vous deviez generer 20 opportunites le mois prochain, quel canal utiliseriez-vous avec certitude ?",
    FOUNDER_LED_SALES: "Quelle part du chiffre d'affaires ne serait pas signee si vous ne participiez plus aux ventes ?",
    LOW_VISIBILITY: "Quels chiffres vous permettent aujourd'hui de prevoir les 90 prochains jours ?",
    MARGIN_BLINDNESS: "Quels clients et offres creent reellement le plus de marge une fois tous les couts integres ?"
  };
  return map[code] || "Quelle est la cause racine de cette dependance dans votre organisation ?";
}

function addFooter(doc, pageNum, clientLabel) {
  // IMPORTANT: footer kept above PDFKit's bottom margin to avoid creating phantom pages.
  const y = 755;
  doc.save();
  doc.moveTo(45, y).lineTo(550, y).strokeColor(COLORS.line).lineWidth(0.5).stroke();
  doc.font("Helvetica-Bold").fontSize(6.5).fillColor(COLORS.muted)
    .text("FORGE - RAPPORT PERSONNEL ET CONFIDENTIEL", 45, y + 9, {
      width: 300, lineBreak: false
    });
  doc.font("Helvetica").fontSize(6.5).fillColor(COLORS.muted)
    .text(`Page ${pageNum}`, 490, y + 9, {
      width: 60, align: "right", lineBreak: false
    });

  doc.fillColor("#C8C8C8").opacity(0.08).font("Helvetica-Bold").fontSize(16);
  doc.rotate(30, { origin: [300, 415] });
  doc.text(clientLabel, 100, 400, { width: 400, align: "center", lineBreak: false });
  doc.restore();
  doc.opacity(1);
}

function addSectionTitle(doc, n, title, subtitle = "") {
  doc.font("Helvetica-Bold").fontSize(10).fillColor(COLORS.gold).text(n, 45, 48);
  doc.font("Helvetica-Bold").fontSize(22).fillColor(COLORS.black).text(title, 45, 72, { width: 500 });
  if (subtitle) {
    doc.font("Helvetica").fontSize(9).fillColor(COLORS.muted)
      .text(subtitle, 45, 108, { width: 500, lineGap: 2 });
  }
}

function metricCard(doc, x, y, w, label, value, band, danger = false) {
  doc.roundedRect(x, y, w, 82, 5).fill(COLORS.light);
  doc.font("Helvetica-Bold").fontSize(6.2).fillColor(COLORS.muted).text(label, x + 12, y + 13, { width: w - 24 });
  doc.font("Helvetica-Bold").fontSize(20).fillColor(danger ? "#C83A3A" : COLORS.gold)
    .text(value, x + 12, y + 33, { width: w - 24 });
  doc.font("Helvetica-Bold").fontSize(6.3).fillColor(COLORS.black)
    .text(band, x + 12, y + 62, { width: w - 24 });
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const payload = body.scanPayload || {};
    const reportRef = safe(body.reportRef, "FORGE-SCAN");
    const calendlyUrl = body.calendlyUrl || "https://calendly.com/jeforge/audit";

    const company = payload.company || {};
    const scores = payload.scores || {};
    const priorities = Array.isArray(scores.red_flags) ? scores.red_flags.slice(0, 3) : [];

    const firstName = safe(company.first_name);
    const companyName = safe(company.company_name);
    const phone = safe(company.phone);
    const email = safe(company.email);
    const clientLabel = `${companyName} - ${email}`;

    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 45, bottom: 45, left: 45, right: 45 },
      autoFirstPage: true,
      info: {
        Title: `FORGE SCAN - ${companyName}`,
        Author: "FORGE",
        Subject: "Diagnostic FORGE personnalise"
      }
    });

    const chunks = [];
    doc.on("data", c => chunks.push(c));

    const qrData = await QRCode.toDataURL(calendlyUrl, {
      width: 300,
      margin: 1,
      color: { dark: COLORS.black, light: COLORS.white }
    });
    const qrBuffer = Buffer.from(qrData.split(",")[1], "base64");

    // PAGE 1 - COVER
    doc.rect(0, 0, 595, 842).fill(COLORS.black);

    // Simple FORGE wordmark - no external asset required
    doc.font("Helvetica").fontSize(28).fillColor(COLORS.ivory).text("F O R G", 45, 56, { lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(28).fillColor(COLORS.gold).text("E", 197, 56, { lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(7).fillColor(COLORS.gold).text("DU JOB A L'ACTIF", 47, 94, { lineBreak: false });

    doc.font("Helvetica-Bold").fontSize(8).fillColor(COLORS.gold)
      .text("FORGE SCAN - RAPPORT PERSONNALISE", 45, 155, { lineBreak: false });

    doc.font("Helvetica-Bold").fontSize(29).fillColor(COLORS.ivory)
      .text("Votre entreprise", 45, 198, { lineBreak: false });
    doc.text("peut-elle fonctionner", 45, 236, { lineBreak: false });
    doc.fillColor(COLORS.gold2).text("sans vous ?", 45, 274, { lineBreak: false });

    doc.rect(45, 326, 52, 2).fill(COLORS.gold);

    doc.font("Helvetica").fontSize(10.5).fillColor("#C7C4BD")
      .text("Ce rapport est le reflet de vos reponses au FORGE SCAN. Il met en evidence les dependances qui limitent aujourd'hui l'autonomie, la previsibilite et la valeur structurelle de votre entreprise.",
        45, 355, { width: 420, lineGap: 3 });

    doc.font("Helvetica-Bold").fontSize(7).fillColor(COLORS.gold).text("ENTREPRISE ANALYSEE", 45, 600, { lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(16).fillColor(COLORS.ivory).text(companyName, 45, 625, { width: 380, lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(12).fillColor(COLORS.ivory).text(firstName, 45, 650, { width: 380, lineBreak: false });
    doc.font("Helvetica").fontSize(8).fillColor("#AAA7A0").text(phone, 45, 673, { lineBreak: false });
    if (email !== "Non renseigne") doc.text(email, 45, 688, { lineBreak: false });

    doc.font("Helvetica").fontSize(7).fillColor("#8B8882")
      .text(`Document personnel - Ref. ${reportRef}`, 45, 724, { lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(6.5).fillColor(COLORS.gold)
      .text("CLARTE   STRUCTURE   AUTONOMIE   PERFORMANCE   VALEUR   LIBERTE", 45, 776, { lineBreak: false });

    // PAGE 2 - SCORE
    doc.addPage();
    addSectionTitle(
      doc,
      "01",
      "VOTRE DIAGNOSTIC EN UN COUP D'OEIL",
      "Les indicateurs ci-dessous sont calcules a partir de vos reponses. Ils mesurent la maturite structurelle de l'entreprise - pas sa valeur financiere."
    );

    doc.roundedRect(45, 150, 505, 210, 6).fill(COLORS.carbon);
    doc.font("Helvetica-Bold").fontSize(7).fillColor(COLORS.gold).text("FORGE SCORE", 65, 176, { lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(62).fillColor(COLORS.gold2)
      .text(safe(scores.forge_score, "-"), 65, 204, { lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(16).fillColor(COLORS.ivory).text("/100", 143, 243, { lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(7).fillColor("#8F8F8F").text("NIVEAU", 65, 304, { lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(12).fillColor(COLORS.ivory)
      .text(forgeLevel(scores.forge_score), 65, 322, { lineBreak: false });

    doc.font("Helvetica-Bold").fontSize(14).fillColor(COLORS.ivory)
      .text("Ce que vos reponses indiquent", 285, 180, { lineBreak: false });
    doc.font("Helvetica").fontSize(9.2).fillColor("#CCC8C0")
      .text(overallInsight(scores), 285, 208, { width: 235, lineGap: 3 });

    const cardY = 390;
    const gap = 8;
    const cardW = (505 - 3 * gap) / 4;
    metricCard(doc, 45, cardY, cardW, "DEPENDANCE DIRIGEANT",
      `${safe(scores.dependency_index, "-")}%`, indicatorBand(scores.dependency_index, true),
      Number(scores.dependency_index) >= 60);
    metricCard(doc, 45 + cardW + gap, cardY, cardW, "PREVISIBILITE",
      `${safe(scores.predictability_index, "-")}/100`, indicatorBand(scores.predictability_index));
    metricCard(doc, 45 + (cardW + gap) * 2, cardY, cardW, "INDICE D'ACTIF",
      `${safe(scores.asset_index, "-")}/100`, indicatorBand(scores.asset_index));
    metricCard(doc, 45 + (cardW + gap) * 3, cardY, cardW, "FRAGILITE",
      `${safe(scores.fragility_index, "-")}/100`, indicatorBand(scores.fragility_index, true),
      Number(scores.fragility_index) >= 60);

    doc.font("Helvetica-Bold").fontSize(8).fillColor(COLORS.gold).text("IMPACT BUSINESS POTENTIEL", 45, 505, { lineBreak: false });

    const consequences = businessConsequences(scores);
    let impactY = 530;
    consequences.forEach((item, idx) => {
      doc.font("Helvetica-Bold").fontSize(13).fillColor(COLORS.gold).text(String(idx + 1), 58, impactY, { lineBreak: false });
      doc.font("Helvetica").fontSize(8.7).fillColor(COLORS.text)
        .text(item, 82, impactY - 1, { width: 455, lineGap: 2 });
      impactY += 42;
    });

    doc.roundedRect(45, 655, 505, 58, 5).fill(COLORS.black);
    doc.font("Helvetica-Bold").fontSize(7).fillColor(COLORS.gold2).text("LA QUESTION QUI CHANGE LE DIAGNOSTIC", 62, 670, { lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(10.5).fillColor(COLORS.ivory)
      .text("Si vous vous absentez totalement pendant 30 jours, qu est-ce qui casse en premier ?", 62, 691, { width: 455 });

    addFooter(doc, 2, clientLabel);

    // PAGE 3 - TOP 3
    doc.addPage();
    addSectionTitle(
      doc,
      "02",
      "VOS 3 POINTS DE DEPENDANCE PRIORITAIRES",
      "Ces trois sujets sont les signaux les plus structurants detectes par votre Scan. Ils doivent etre approfondis avant de definir un plan de transformation."
    );

    let cy = 150;
    for (let i = 0; i < 3; i++) {
      const p = priorities[i] || {};
      const code = p.code || "";
      const title = safe(p.title, `Priorite ${i + 1}`);
      const why = safe(p.why, "Point a approfondir pendant l'entretien.");

      doc.roundedRect(45, cy, 505, 175, 6).fill(COLORS.light);
      doc.font("Helvetica-Bold").fontSize(22).fillColor(COLORS.gold).text(`0${i + 1}`, 62, cy + 22, { lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(12).fillColor(COLORS.black)
        .text(title, 110, cy + 24, { width: 385 });

      doc.font("Helvetica-Bold").fontSize(6.5).fillColor(COLORS.gold).text("SIGNAL", 110, cy + 58, { lineBreak: false });
      doc.font("Helvetica").fontSize(8.8).fillColor(COLORS.text)
        .text(why, 110, cy + 76, { width: 410, lineGap: 2 });

      doc.font("Helvetica-Bold").fontSize(6.5).fillColor(COLORS.gold).text("CONSEQUENCE BUSINESS", 110, cy + 111, { lineBreak: false });
      doc.font("Helvetica").fontSize(8.8).fillColor(COLORS.text)
        .text(consequenceFor(code), 110, cy + 129, { width: 410, lineGap: 2 });

      doc.font("Helvetica-Bold").fontSize(6.5).fillColor(COLORS.muted).text("QUESTION A TRAITER EN ENTRETIEN", 110, cy + 157, { lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(8.3).fillColor(COLORS.black)
        .text(questionFor(code), 250, cy + 155, { width: 270 });

      cy += 190;
    }

    addFooter(doc, 3, clientLabel);

    // PAGE 4 - CTA
    doc.addPage();
    addSectionTitle(
      doc,
      "03",
      "VOUS AVEZ LE QUOI. CONSTRUISONS LE POURQUOI ET LE COMMENT.",
      "Le Diagnostic FORGE 360 transforme vos scores en trajectoire de transformation priorisee."
    );

    doc.font("Helvetica").fontSize(9.3).fillColor(COLORS.muted)
      .text("Deux entreprises avec le meme score peuvent avoir des causes radicalement differentes. L entretien permet de comprendre la cause racine, mesurer l impact et choisir la premiere transformation a engager.",
        45, 145, { width: 500, lineGap: 3 });

    const blocks = [
      ["1", "IDENTIFIER LA CAUSE RACINE", "Comprendre ce qui entretient reellement chaque dependance : organisation, roles, management, vente, process ou pilotage."],
      ["2", "MESURER SON IMPACT", "Qualifier l'impact sur le temps du dirigeant, les equipes, la croissance, la marge et la capacite a s'absenter."],
      ["3", "PRIORISER LA TRANSFORMATION", "Choisir la sequence de travail qui produit le plus d'effet de levier sans ajouter une nouvelle couche de complexite."]
    ];

    let by = 205;
    for (const [n, t, d] of blocks) {
      doc.roundedRect(45, by, 505, 78, 5).fill(COLORS.light);
      doc.font("Helvetica-Bold").fontSize(18).fillColor(COLORS.gold).text(n, 62, by + 24, { lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(10).fillColor(COLORS.black).text(t, 98, by + 18, { lineBreak: false });
      doc.font("Helvetica").fontSize(8.4).fillColor(COLORS.text).text(d, 98, by + 38, { width: 425, lineGap: 2 });
      by += 92;
    }

    doc.roundedRect(45, 505, 505, 205, 8).fill(COLORS.black);
    doc.font("Helvetica-Bold").fontSize(7).fillColor(COLORS.gold2)
      .text("VOTRE PROCHAINE ETAPE", 72, 530, { lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(19).fillColor(COLORS.ivory)
      .text("DIAGNOSTIC FORGE 360", 72, 557, { lineBreak: false });
    doc.font("Helvetica").fontSize(9).fillColor("#D0CCC4")
      .text("45 minutes pour identifier la cause de vos 3 dependances, leur impact reel et la premiere sequence a engager.",
        72, 590, { width: 270, lineGap: 3 });

    doc.image(qrBuffer, 390, 540, { width: 112, height: 112 });
    doc.font("Helvetica-Bold").fontSize(6.5).fillColor(COLORS.gold2)
      .text("SCANNEZ POUR RESERVER", 378, 658, { width: 140, align: "center" });

    doc.roundedRect(72, 642, 250, 42, 4).fill(COLORS.gold);
    doc.font("Helvetica-Bold").fontSize(9.2).fillColor(COLORS.black)
      .text("RESERVER MON ENTRETIEN FORGE", 72, 656, {
        width: 250, align: "center", link: calendlyUrl, underline: false
      });

    doc.font("Helvetica").fontSize(6.8).fillColor("#8F8B83")
      .text(`Rapport personnel : ${firstName} - ${companyName}`, 72, 694, { lineBreak: false });

    addFooter(doc, 4, clientLabel);

    doc.end();

    await new Promise((resolve, reject) => {
      doc.on("end", resolve);
      doc.on("error", reject);
    });

    const pdfBuffer = Buffer.concat(chunks);

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const bucket = process.env.SUPABASE_BUCKET || "forge-reports";

    if (!supabaseUrl || !supabaseServiceKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Supabase non configure sur Netlify." })
      };
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false }
    });

    const fileName = `${reportRef}.pdf`;

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(fileName, pdfBuffer, {
        contentType: "application/pdf",
        upsert: false
      });

    if (uploadError) throw uploadError;

    const { data: signed, error: signError } = await supabase.storage
      .from(bucket)
      .createSignedUrl(fileName, 60 * 60 * 24 * 7);

    if (signError) throw signError;

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        reportRef,
        reportUrl: signed.signedUrl
      })
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message || "Erreur de generation du rapport." })
    };
  }
};
