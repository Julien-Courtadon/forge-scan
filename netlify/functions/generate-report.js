const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");
const { createClient } = require("@supabase/supabase-js");

function safe(v, fallback = "Non renseigne") {
  return v === undefined || v === null || v === "" ? fallback : String(v);
}

function addFooter(doc, pageNum, clientLabel) {
  const y = 790;
  doc.moveTo(45, y).lineTo(550, y).strokeColor("#d8d3ca").lineWidth(0.5).stroke();
  doc.font("Helvetica").fontSize(7).fillColor("#777777")
    .text("FORGE - RAPPORT PERSONNEL ET CONFIDENTIEL", 45, y + 8, { width: 320 });
  doc.text(`Page ${pageNum}`, 480, y + 8, { width: 70, align: "right" });
  doc.save();
  doc.fillColor("#bbbbbb").opacity(0.11).font("Helvetica-Bold").fontSize(18);
  doc.rotate(30, { origin: [300, 420] });
  doc.text(clientLabel, 110, 400, { width: 400, align: "center" });
  doc.restore();
  doc.opacity(1);
}

function addTitle(doc, n, title) {
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#c9a253").text(n, 45, 50);
  doc.font("Helvetica-Bold").fontSize(23).fillColor("#111111").text(title, 45, 75);
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
    const priorities = Array.isArray(scores.red_flags) ? scores.red_flags.slice(0,3) : [];

    const firstName = safe(company.first_name);
    const companyName = safe(company.company_name);
    const phone = safe(company.phone);
    const email = safe(company.email);
    const clientLabel = `${companyName} - ${email}`;

    const doc = new PDFDocument({ size: "A4", margin: 45 });
    const chunks = [];
    doc.on("data", c => chunks.push(c));

    const qrData = await QRCode.toDataURL(calendlyUrl, {
      width: 260,
      margin: 1,
      color: { dark: "#111111", light: "#ffffff" }
    });
    const qrBuffer = Buffer.from(qrData.split(",")[1], "base64");

    // PAGE 1
    doc.rect(0,0,595,842).fill("#070707");
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#c9a253").text("FORGE",45,55);
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#c9a253").text("DU JOB A L'ACTIF",45,72);
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#c9a253").text("FORGE SCAN - RAPPORT PERSONNALISE",45,140);
    doc.font("Helvetica-Bold").fontSize(30).fillColor("#f5f4f1")
      .text("Votre entreprise\npeut-elle fonctionner",45,185,{lineGap:2});
    doc.fillColor("#e3be6a").text("sans vous ?",45,265);
    doc.rect(45,320,50,2).fill("#c9a253");

    doc.font("Helvetica-Bold").fontSize(15).fillColor("#f5f4f1").text(firstName,45,610);
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#c9a253").text(companyName,45,635);
    doc.font("Helvetica").fontSize(8).fillColor("#aaa7a0").text(phone,45,657);
    if(email !== "Non renseigne") doc.text(email,45,670);
    doc.font("Helvetica").fontSize(8).fillColor("#aaa7a0")
      .text(`Document personnel - Ref. ${reportRef}`,45,710);
    doc.font("Helvetica-Bold").fontSize(7).fillColor("#c9a253")
      .text("CLARTE   STRUCTURE   AUTONOMIE   PERFORMANCE   VALEUR   LIBERTE",45,770);

    // PAGE 2
    doc.addPage();
    addTitle(doc,"01","VOS NOTES FORGE");
    doc.font("Helvetica").fontSize(9).fillColor("#747474")
      .text("Ces indicateurs sont calcules a partir de vos reponses au FORGE SCAN.",45,112,{width:500});

    doc.roundedRect(45,155,505,230,6).fill("#111214");
    doc.font("Helvetica-Bold").fontSize(7).fillColor("#c9a253").text("FORGE SCORE",65,180);
    doc.font("Helvetica-Bold").fontSize(64).fillColor("#e3be6a")
      .text(safe(scores.forge_score,"-"),65,205);
    doc.font("Helvetica-Bold").fontSize(16).fillColor("#f5f4f1").text("/100",140,245);

    const metricRows = [
      ["DEPENDANCE", scores.dependency_index !== undefined ? `${scores.dependency_index}%` : "-"],
      ["PREVISIBILITE", scores.predictability_index !== undefined ? `${scores.predictability_index}/100` : "-"],
      ["INDICE D'ACTIF", scores.asset_index !== undefined ? `${scores.asset_index}/100` : "-"],
      ["FRAGILITE", scores.fragility_index !== undefined ? `${scores.fragility_index}/100` : "-"]
    ];
    let my = 182;
    metricRows.forEach(([label,val]) => {
      doc.font("Helvetica-Bold").fontSize(6.5).fillColor("#8f8f8f").text(label,300,my);
      doc.font("Helvetica-Bold").fontSize(12).fillColor("#e3be6a").text(val,440,my-2);
      my += 43;
    });
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#c9a253").text("VOTRE LECTURE",45,430);
    doc.font("Helvetica").fontSize(10).fillColor("#1a1a1a")
      .text("Votre prochain niveau consiste a reduire les dependances les plus structurantes avant d'ajouter davantage de croissance ou de complexite.",45,455,{width:500,lineGap:3});
    addFooter(doc,2,clientLabel);

    // PAGE 3
    doc.addPage();
    addTitle(doc,"02","VOS 3 POINTS A AMELIORER");
    doc.font("Helvetica").fontSize(9).fillColor("#747474")
      .text("Les trois sujets ci-dessous sont classes selon leur priorite dans votre diagnostic.",45,112,{width:500});

    let cy = 155;
    for(let i=0;i<3;i++){
      const p = priorities[i] || {};
      doc.roundedRect(45,cy,505,155,6).fill("#f3f1ec");
      doc.font("Helvetica-Bold").fontSize(24).fillColor("#c9a253").text(`0${i+1}`,62,cy+25);
      doc.font("Helvetica-Bold").fontSize(12).fillColor("#111111")
        .text(safe(p.title, `Priorite ${i+1}`),110,cy+25,{width:340});
      if(p.priority !== undefined){
        doc.font("Helvetica-Bold").fontSize(9).fillColor("#c9a253")
          .text(`${p.priority}/100`,470,cy+28,{width:60,align:"right"});
      }
      doc.font("Helvetica-Bold").fontSize(6.5).fillColor("#c9a253").text("CONSTAT",110,cy+68);
      doc.font("Helvetica").fontSize(9).fillColor("#222222")
        .text(safe(p.why,"Point a approfondir pendant l'entretien."),110,cy+85,{width:400,lineGap:2});
      doc.font("Helvetica-Bold").fontSize(6.5).fillColor("#777777").text("PREMIERE ACTION",110,cy+123);
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#111111")
        .text(safe(p.action,"Clarifier la cause et la priorite d'action."),110,cy+137,{width:400});
      cy += 175;
    }
    addFooter(doc,3,clientLabel);

    // PAGE 4
    doc.addPage();
    addTitle(doc,"03","TRANSFORMEZ VOS SCORES EN PLAN D'ACTION");
    doc.font("Helvetica").fontSize(9.5).fillColor("#747474")
      .text("Le Scan identifie ou se trouvent les tensions. L'entretien FORGE permet d'en comprendre la cause, le cout et l'ordre de traitement.",45,112,{width:500,lineGap:3});

    doc.roundedRect(45,175,505,460,8).fill("#070707");
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#e3be6a").text("DIAGNOSTIC FORGE 360",75,215);
    doc.font("Helvetica-Bold").fontSize(20).fillColor("#f5f4f1").text("45 minutes pour clarifier",75,250);
    doc.fillColor("#e3be6a").text("vos 3 priorites.",75,278);

    doc.font("Helvetica").fontSize(9).fillColor("#d0ccc4").text(
      "Pendant cet echange, nous identifions la cause exacte de chaque dependance, son impact et la sequence de transformation la plus pertinente.",
      75,325,{width:275,lineGap:3}
    );

    doc.image(qrBuffer,380,335,{width:120,height:120});
    doc.font("Helvetica-Bold").fontSize(7).fillColor("#e3be6a")
      .text("SCANNEZ POUR RESERVER",370,465,{width:140,align:"center"});
    doc.font("Helvetica").fontSize(7).fillColor("#a9a49a")
      .text("calendly.com/jeforge/audit",365,480,{width:150,align:"center"});

    doc.roundedRect(75,515,250,44,4).fill("#c9a253");
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#070707")
      .text("RESERVER MON ENTRETIEN FORGE",75,530,{width:250,align:"center"});

    doc.font("Helvetica").fontSize(7).fillColor("#8f8b83")
      .text(`Rapport personnel : ${firstName} - ${companyName}`,75,590);
    addFooter(doc,4,clientLabel);

    doc.end();

    await new Promise((resolve, reject) => {
      doc.on("end", resolve);
      doc.on("error", reject);
    });

    const pdfBuffer = Buffer.concat(chunks);

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const bucket = process.env.SUPABASE_BUCKET || "forge-reports";

    if(!supabaseUrl || !supabaseServiceKey){
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

    if(uploadError) throw uploadError;

    const { data: signed, error: signError } = await supabase.storage
      .from(bucket)
      .createSignedUrl(fileName, 60 * 60 * 24 * 7);

    if(signError) throw signError;

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