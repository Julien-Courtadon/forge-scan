const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");
const { createClient } = require("@supabase/supabase-js");
const path = require("path");

const C = {
  black: "#070707",
  carbon: "#111214",
  gold: "#C9A253",
  gold2: "#E3BE6A",
  ivory: "#F5F4F1",
  text: "#1A1A1A",
  muted: "#747474",
  light: "#F3F1EC",
  line: "#D8D3CA",
  danger: "#B72E2E",
  white: "#FFFFFF"
};

function safe(v, fallback = "Non renseigné") {
  return v === undefined || v === null || v === "" ? fallback : String(v);
}

function forgeLevel(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return "NON DISPONIBLE";
  if (n >= 85) return "INVESTISSEUR";
  if (n >= 70) return "PROPRIÉTAIRE";
  if (n >= 55) return "BÂTISSEUR";
  if (n >= 40) return "OPÉRATEUR";
  return "PRISONNIER";
}

function indicatorBand(score, inverse = false) {
  const n = Number(score);
  if (!Number.isFinite(n)) return "NON DISPONIBLE";
  if (inverse) {
    if (n >= 80) return "CRITIQUE";
    if (n >= 60) return "ÉLEVÉ";
    if (n >= 40) return "SIGNIFICATIF";
    if (n >= 20) return "MODÉRÉ";
    return "FAIBLE";
  }
  if (n >= 85) return "EXCELLENT";
  if (n >= 70) return "SOLIDE";
  if (n >= 55) return "STRUCTURÉ";
  if (n >= 40) return "FRAGILE";
  if (n >= 20) return "FAIBLE";
  return "TRÈS FAIBLE";
}

function overallInsight(scores) {
  const forge = Number(scores.forge_score ?? 0);
  const dep = Number(scores.dependency_index ?? 0);
  const pred = Number(scores.predictability_index ?? 0);
  const asset = Number(scores.asset_index ?? 0);
  const frag = Number(scores.fragility_index ?? 0);

  if (forge < 40 && dep >= 70 && frag >= 70) {
    return "Votre entreprise génère de l'activité, mais sa capacité à fonctionner sans le dirigeant reste faible. Avec une dépendance et une fragilité élevées, la croissance peut augmenter la charge du dirigeant plus vite que la valeur de l'entreprise. La priorité est de sécuriser le système avant d'accélérer.";
  }
  if (dep >= 70) {
    return "La dépendance au dirigeant est aujourd'hui le signal le plus structurant. Tant que les décisions, la vente ou le pilotage restent fortement attachés à une personne, l'entreprise demeure difficile à rendre autonome, scalable et transmissible.";
  }
  if (frag >= 70) {
    return "Le diagnostic révèle plusieurs points uniques de défaillance. Une entreprise peut être rentable tout en restant fragile : l'enjeu est de sécuriser les relais, le savoir et les mécanismes critiques avant d'augmenter la complexité.";
  }
  if (pred < 50) {
    return "La prévisibilité reste insuffisante pour piloter sereinement les 90 prochains jours. L'enjeu est de rendre acquisition, pipeline, ventes et pilotage plus mesurables afin de réduire le pilotage à vue.";
  }
  if (asset < 50) {
    return "L'entreprise fonctionne, mais une partie de sa valeur structurelle reste encore attachée à des personnes plutôt qu'à des systèmes. Le prochain niveau consiste à transformer davantage de savoir, de décisions et de ventes en actifs transmissibles.";
  }
  return "Votre entreprise dispose de bases structurelles solides. Le prochain enjeu consiste à augmenter simultanément autonomie, prévisibilité et valeur d'actif sans recréer de dépendance au dirigeant.";
}

function businessConsequences(scores) {
  const dep = Number(scores.dependency_index ?? 0);
  const pred = Number(scores.predictability_index ?? 0);
  const asset = Number(scores.asset_index ?? 0);
  const frag = Number(scores.fragility_index ?? 0);
  const items = [];
  if (dep >= 60) items.push("Scalabilité limitée : davantage de croissance peut entraîner davantage de sollicitations du dirigeant.");
  if (frag >= 60) items.push("Risque opérationnel : une absence, un départ ou un incident peut affecter plusieurs fonctions critiques.");
  if (pred < 50) items.push("Prévisibilité faible : chiffre d'affaires, ressources et décisions restent plus difficiles à anticiper.");
  if (asset < 50) items.push("Valeur d'actif réduite : une partie du savoir et de la performance reste attachée aux personnes plutôt qu'au système.");
  return items.slice(0, 3);
}

function consequenceFor(code) {
  const map = {
    FOUNDER_CRITICAL: "Cette configuration plafonne la scalabilité : chaque nouvelle couche de croissance risque d'augmenter les sollicitations du dirigeant et de réduire la transmissibilité de l'entreprise.",
    NO_SECOND_IN_COMMAND: "Sans relais de pilotage, l'absence du dirigeant devient un risque opérationnel et peut ralentir rapidement la prise de décision.",
    FOUNDER_FIREFIGHTER: "Le mode pompier entretient la dépendance, fragilise la priorisation et réduit le temps consacré aux sujets à fort effet de levier.",
    KEY_PERSON_RISK: "Une personne clé peut devenir un point unique de défaillance et compliquer la continuité d'activité, l'onboarding ou la transmission.",
    KNOWLEDGE_NOT_SYSTEMIZED: "Un savoir non formalisé reste difficile à déléguer, automatiser et transmettre. Il limite directement l'autonomie de l'organisation.",
    ACQUISITION_DEPENDENCY: "Une acquisition peu reproductible rend le chiffre d'affaires plus difficile à anticiper et augmente la pression commerciale sur le dirigeant.",
    FOUNDER_LED_SALES: "Lorsque le fondateur reste indispensable à la vente, le chiffre d'affaires reste mécaniquement lié à sa disponibilité. La croissance commerciale n'est pas encore un actif autonome.",
    LOW_VISIBILITY: "Un pilotage insuffisamment visible rend les arbitrages plus réactifs et limite la capacité à anticiper trésorerie, recrutement ou production.",
    MARGIN_BLINDNESS: "Une lecture insuffisante de la marge peut conduire à développer des activités qui consomment beaucoup de ressources sans créer suffisamment de valeur."
  };
  return map[code] || "Ce point peut limiter l'autonomie, la prévisibilité ou la capacité de l'entreprise à absorber sa croissance.";
}

function questionFor(code) {
  const map = {
    FOUNDER_CRITICAL: "Quelles décisions reviennent encore systématiquement jusqu'à vous - et pourquoi ?",
    NO_SECOND_IN_COMMAND: "Qui pourrait aujourd'hui reprendre le pilotage pendant deux semaines sans vous ?",
    FOUNDER_FIREFIGHTER: "Quels sont les trois problèmes qui reviennent le plus souvent jusqu'à vous ?",
    KEY_PERSON_RISK: "Que se passerait-il si cette personne clé était absente demain pendant un mois ?",
    KNOWLEDGE_NOT_SYSTEMIZED: "Quel savoir critique n'existe encore que dans la tête d'une personne ?",
    ACQUISITION_DEPENDENCY: "Si vous deviez générer 20 opportunités le mois prochain, quel canal utiliseriez-vous avec certitude ?",
    FOUNDER_LED_SALES: "Quelle part du chiffre d'affaires ne serait pas signée si vous ne participiez plus aux ventes ?",
    LOW_VISIBILITY: "Quels chiffres vous permettent aujourd'hui de prévoir les 90 prochains jours ?",
    MARGIN_BLINDNESS: "Quels clients et offres créent réellement le plus de marge une fois tous les coûts intégrés ?"
  };
  return map[code] || "Quelle est la cause racine de cette dépendance dans votre organisation ?";
}

function addFooter(doc, pageNum, clientLabel) {
  // Stay safely inside the page content box: prevents phantom pages.
  const y = 742;
  doc.save();
  doc.moveTo(45, y).lineTo(550, y).strokeColor(C.line).lineWidth(0.5).stroke();
  doc.font("Helvetica-Bold").fontSize(6.2).fillColor(C.muted)
    .text("FORGE - RAPPORT PERSONNEL ET CONFIDENTIEL", 45, y + 9, {
      width: 300, lineBreak: false
    });
  doc.font("Helvetica").fontSize(6.2).fillColor(C.muted)
    .text(`Page ${pageNum}`, 490, y + 9, {
      width: 60, align: "right", lineBreak: false
    });
  doc.fillColor("#BDBDBD").opacity(0.07).font("Helvetica-Bold").fontSize(15);
  doc.rotate(30, { origin: [300, 410] });
  doc.text(clientLabel, 105, 397, {
    width: 390, align: "center", lineBreak: false
  });
  doc.restore();
  doc.opacity(1);
}

function addSectionTitle(doc, n, title, subtitle = "") {
  doc.font("Helvetica-Bold").fontSize(10).fillColor(C.gold).text(n, 45, 46, { lineBreak: false });
  doc.font("Helvetica-Bold").fontSize(21).fillColor(C.black).text(title, 45, 70, { width: 500 });
  if (subtitle) {
    doc.font("Helvetica").fontSize(8.8).fillColor(C.muted).text(subtitle, 45, 106, {
      width: 500, lineGap: 2
    });
  }
}

function metricCard(doc, x, y, w, label, value, band, danger = false) {
  doc.roundedRect(x, y, w, 80, 5).fill(C.light);
  doc.font("Helvetica-Bold").fontSize(6).fillColor(C.muted).text(label, x + 11, y + 12, { width: w - 22 });
  doc.font("Helvetica-Bold").fontSize(19).fillColor(danger ? C.danger : C.gold)
    .text(value, x + 11, y + 32, { width: w - 22 });
  doc.font("Helvetica-Bold").fontSize(6.1).fillColor(C.black).text(band, x + 11, y + 60, { width: w - 22 });
}

const FORGE_LOGO_PATH = path.resolve(process.cwd(), "assets/forge-logo.png");

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
      margins: { top: 42, bottom: 42, left: 45, right: 45 },
      bufferPages: true,
      info: {
        Title: `FORGE SCAN - ${companyName}`,
        Author: "FORGE",
        Subject: "Diagnostic FORGE personnalisé"
      }
    });

    const chunks = [];
    doc.on("data", chunk => chunks.push(chunk));

    const qrData = await QRCode.toDataURL(calendlyUrl, {
      width: 300,
      margin: 1,
      color: { dark: C.black, light: C.white }
    });
    const qrBuffer = Buffer.from(qrData.split(",")[1], "base64");

    // PAGE 1
    doc.rect(0, 0, 595, 842).fill(C.black);
    // Logo FORGE officiel fourni par le client
    doc.image(FORGE_LOGO_PATH, 45, 45, { fit: [235, 82], align: "left", valign: "top" });

    doc.font("Helvetica-Bold").fontSize(8).fillColor(C.gold)
      .text("FORGE SCAN - RAPPORT PERSONNALISÉ", 45, 150, { lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(29).fillColor(C.ivory).text("Votre entreprise", 45, 194, { lineBreak: false });
    doc.text("peut-elle fonctionner", 45, 232, { lineBreak: false });
    doc.fillColor(C.gold2).text("sans vous ?", 45, 270, { lineBreak: false });
    doc.rect(45, 322, 52, 2).fill(C.gold);

    doc.font("Helvetica").fontSize(10.2).fillColor("#C7C4BD")
      .text("Ce rapport reflète vos réponses au FORGE SCAN. Il met en évidence les dépendances qui limitent aujourd'hui l'autonomie, la prévisibilité et la valeur structurelle de votre entreprise.",
        45, 351, { width: 420, lineGap: 3 });

    doc.font("Helvetica-Bold").fontSize(7).fillColor(C.gold).text("ENTREPRISE ANALYSÉE", 45, 592, { lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(16).fillColor(C.ivory).text(companyName, 45, 617, { width: 380, lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(12).fillColor(C.ivory).text(firstName, 45, 643, { width: 380, lineBreak: false });
    doc.font("Helvetica").fontSize(8).fillColor("#AAA7A0").text(phone, 45, 667, { lineBreak: false });
    if (email !== "Non renseigné") doc.text(email, 45, 682, { lineBreak: false });
    doc.font("Helvetica").fontSize(7).fillColor("#8B8882")
      .text(`Document personnel - Ref. ${reportRef}`, 45, 714, { lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(6.5).fillColor(C.gold)
      .text("CLARTÉ   STRUCTURE   AUTONOMIE   PERFORMANCE   VALEUR   LIBERTÉ", 45, 774, { lineBreak: false });

    // PAGE 2
    doc.addPage();
    addSectionTitle(
      doc,
      "01",
      "VOTRE DIAGNOSTIC EN UN COUP D'ŒIL",
      "Ces indicateurs mesurent la maturité structurelle de l'entreprise. Ils ne constituent ni une valorisation financière ni un benchmark externe."
    );

    doc.roundedRect(45, 145, 505, 205, 6).fill(C.carbon);
    doc.font("Helvetica-Bold").fontSize(7).fillColor(C.gold).text("FORGE SCORE", 65, 170, { lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(60).fillColor(C.gold2).text(safe(scores.forge_score, "-"), 65, 198, { lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(15).fillColor(C.ivory).text("/100", 143, 236, { lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(7).fillColor("#8F8F8F").text("NIVEAU", 65, 292, { lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(12).fillColor(C.ivory).text(forgeLevel(scores.forge_score), 65, 310, { lineBreak: false });

    doc.font("Helvetica-Bold").fontSize(13).fillColor(C.ivory).text("Ce que vos réponses indiquent", 285, 174, { lineBreak: false });
    doc.font("Helvetica").fontSize(8.8).fillColor("#CCC8C0")
      .text(overallInsight(scores), 285, 203, { width: 235, lineGap: 2.8 });

    const cardY = 375;
    const gap = 8;
    const cardW = (505 - 3 * gap) / 4;
    metricCard(doc, 45, cardY, cardW, "DÉPENDANCE DIRIGEANT",
      `${safe(scores.dependency_index, "-")}%`,
      indicatorBand(scores.dependency_index, true),
      Number(scores.dependency_index) >= 60);
    metricCard(doc, 45 + cardW + gap, cardY, cardW, "PRÉVISIBILITÉ",
      `${safe(scores.predictability_index, "-")}/100`,
      indicatorBand(scores.predictability_index));
    metricCard(doc, 45 + (cardW + gap) * 2, cardY, cardW, "INDICE D'ACTIF",
      `${safe(scores.asset_index, "-")}/100`,
      indicatorBand(scores.asset_index));
    metricCard(doc, 45 + (cardW + gap) * 3, cardY, cardW, "FRAGILITÉ",
      `${safe(scores.fragility_index, "-")}/100`,
      indicatorBand(scores.fragility_index, true),
      Number(scores.fragility_index) >= 60);

    doc.font("Helvetica-Bold").fontSize(8).fillColor(C.gold).text("IMPACT BUSINESS POTENTIEL", 45, 492, { lineBreak: false });
    const impacts = businessConsequences(scores);
    let iy = 520;
    impacts.forEach((item, idx) => {
      doc.font("Helvetica-Bold").fontSize(12).fillColor(C.gold).text(String(idx + 1), 58, iy, { lineBreak: false });
      doc.font("Helvetica").fontSize(8.4).fillColor(C.text).text(item, 82, iy - 1, {
        width: 455, lineGap: 2
      });
      iy += 40;
    });

    doc.roundedRect(45, 650, 505, 58, 5).fill(C.black);
    doc.font("Helvetica-Bold").fontSize(7).fillColor(C.gold2)
      .text("LA QUESTION QUI CHANGE LE DIAGNOSTIC", 62, 665, { lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(10.2).fillColor(C.ivory)
      .text("Si vous vous absentez totalement pendant 30 jours, qu'est-ce qui casse en premier ?", 62, 686, {
        width: 455
      });
    addFooter(doc, 2, clientLabel);

    // PAGE 3
    doc.addPage();
    addSectionTitle(
      doc,
      "02",
      "VOS 3 POINTS DE DÉPENDANCE PRIORITAIRES",
      "Ces trois signaux structurants doivent être approfondis avant de définir un plan de transformation."
    );

    let cy = 145;
    for (let i = 0; i < 3; i++) {
      const p = priorities[i] || {};
      const code = p.code || "";
      doc.roundedRect(45, cy, 505, 170, 6).fill(C.light);
      doc.font("Helvetica-Bold").fontSize(22).fillColor(C.gold).text(`0${i + 1}`, 62, cy + 21, { lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(11.5).fillColor(C.black)
        .text(safe(p.title, `Priorité ${i + 1}`), 110, cy + 23, { width: 390 });

      doc.font("Helvetica-Bold").fontSize(6.3).fillColor(C.gold).text("SIGNAL", 110, cy + 55, { lineBreak: false });
      doc.font("Helvetica").fontSize(8.5).fillColor(C.text)
        .text(safe(p.why, "Point à approfondir pendant l'entretien."), 110, cy + 72, {
          width: 410, lineGap: 2
        });

      doc.font("Helvetica-Bold").fontSize(6.3).fillColor(C.gold).text("CONSÉQUENCE BUSINESS", 110, cy + 107, { lineBreak: false });
      doc.font("Helvetica").fontSize(8.4).fillColor(C.text)
        .text(consequenceFor(code), 110, cy + 124, { width: 410, lineGap: 2 });

      doc.font("Helvetica-Bold").fontSize(6.2).fillColor(C.muted)
        .text("QUESTION À TRAITER EN ENTRETIEN", 110, cy + 151, { lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(8).fillColor(C.black)
        .text(questionFor(code), 280, cy + 149, { width: 240 });

      cy += 184;
    }
    addFooter(doc, 3, clientLabel);

    // PAGE 4
    doc.addPage();
    addSectionTitle(
      doc,
      "03",
      "DU DIAGNOSTIC AU PLAN D'ACTION",
      "Vos scores indiquent où agir. Le Diagnostic FORGE 360 permet de comprendre pourquoi et dans quel ordre transformer l'entreprise."
    );

    doc.font("Helvetica").fontSize(9).fillColor(C.muted)
      .text("Le scan révèle les symptômes. L'entretien FORGE identifie leurs causes, leur coût réel et la séquence de transformation qui produira le plus d'effet de levier.",
        45, 148, { width: 500, lineGap: 3 });

    const blocks = [
      ["1", "IDENTIFIER LA CAUSE RACINE", "Comprendre ce qui entretient réellement chaque dépendance : organisation, rôles, management, vente, process ou pilotage."],
      ["2", "MESURER SON IMPACT", "Qualifier l'impact sur le temps du dirigeant, les équipes, la croissance, la marge et la capacité à s'absenter."],
      ["3", "PRIORISER LA TRANSFORMATION", "Choisir la séquence qui produit le plus d'effet de levier sans ajouter une nouvelle couche de complexité."]
    ];

    let by = 202;
    for (const [n, t, d] of blocks) {
      doc.roundedRect(45, by, 505, 76, 5).fill(C.light);
      doc.font("Helvetica-Bold").fontSize(18).fillColor(C.gold).text(n, 62, by + 23, { lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(9.8).fillColor(C.black).text(t, 98, by + 17, { lineBreak: false });
      doc.font("Helvetica").fontSize(8.2).fillColor(C.text).text(d, 98, by + 37, {
        width: 425, lineGap: 2
      });
      by += 88;
    }

    doc.roundedRect(45, 495, 505, 210, 8).fill(C.black);
    doc.font("Helvetica-Bold").fontSize(7).fillColor(C.gold2).text("VOTRE PROCHAINE ÉTAPE", 72, 520, { lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(19).fillColor(C.ivory).text("DIAGNOSTIC FORGE 360", 72, 548, { lineBreak: false });
    doc.font("Helvetica").fontSize(8.8).fillColor("#D0CCC4")
      .text("45 minutes pour transformer vos 3 priorités en décisions concrètes et construire votre première feuille de route.",
        72, 580, { width: 275, lineGap: 3 });

    doc.image(qrBuffer, 392, 535, { width: 110, height: 110 });
    doc.font("Helvetica-Bold").fontSize(6.4).fillColor(C.gold2)
      .text("SCANNEZ POUR RÉSERVER", 378, 651, { width: 140, align: "center" });

    doc.roundedRect(72, 635, 250, 42, 4).fill(C.gold);
    doc.font("Helvetica-Bold").fontSize(9).fillColor(C.black)
      .text("RÉSERVER MON ENTRETIEN FORGE", 72, 649, {
        width: 250, align: "center", link: calendlyUrl
      });

    doc.font("Helvetica").fontSize(6.7).fillColor("#8F8B83")
      .text(`Rapport personnel : ${firstName} - ${companyName}`, 72, 688, { lineBreak: false });

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
      throw new Error("SUPABASE_CONFIG_MISSING");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const fileName = `${reportRef}.pdf`;

    console.log("FORGE_UPLOAD_START", { reportRef, bucket, fileName, pdfBytes: pdfBuffer.length });

    const { data: uploaded, error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(fileName, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true
      });

    if (uploadError) {
      throw new Error(`UPLOAD_SUPABASE_FAILED: ${uploadError.message}`);
    }

    const { data: verifyData, error: verifyError } = await supabase.storage
      .from(bucket)
      .list("", { limit: 1000, search: fileName });

    if (verifyError) {
      throw new Error(`VERIFY_SUPABASE_FAILED: ${verifyError.message}`);
    }

    const exists = Array.isArray(verifyData) && verifyData.some(f => f && f.name === fileName);
    if (!exists) {
      throw new Error(`VERIFY_SUPABASE_FAILED: fichier ${fileName} introuvable apres upload`);
    }

    const { data: signed, error: signError } = await supabase.storage
      .from(bucket)
      .createSignedUrl(fileName, 60 * 60 * 24 * 7);

    if (signError || !signed || !signed.signedUrl) {
      throw new Error(`SIGNED_URL_FAILED: ${signError ? signError.message : "URL absente"}`);
    }

    console.log("FORGE_REPORT_READY", { reportRef, fileName });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        reportRef,
        verified: true,
        storagePath: uploaded && uploaded.path ? uploaded.path : fileName,
        reportUrl: signed.signedUrl
      })
    };

  } catch (err) {
    console.error("FORGE_REPORT_ERROR", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: false,
        error: err.message || "Erreur de generation du rapport."
      })
    };
  }
};
