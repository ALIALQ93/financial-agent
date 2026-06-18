require("dotenv").config();
const { fetchSheetRows } = require("./sheets");
(async () => {
  const rows = await fetchSheetRows();
  const header = rows[0];
  const recs = rows.slice(1).map(c => Object.fromEntries(header.map((h,i)=>[h,c[i]||""])));
  const types = [...new Set(recs.map(r=>r["?????"]))];
  console.log("types:", types);
  const accounts = recs.filter(r=>r["??????"].includes("???")||r["??????"].includes("????")||r["??????"].includes("????"));
  console.log("contractor rows:", accounts.length, accounts.slice(0,3).map(r=>r["??????"]));
  const noRev = recs.filter(r=>r["?????"].includes("?????"));
  console.log("revenue rows sample:", noRev.length, noRev[0]);
})();
