/* Settings for the "original page" link. Leave both empty when you share the app: the link is then hidden
   and only the page number is shown, so no PDF (and no commentary) travels with the app.

   For your own copy: put your PDF chunks (part-01_pages-0084-0183.pdf ...) in a folder and give its path
   relative to index.html, e.g. "source/". Same for the Ram Avtar scan chunks (Ramavtar_part01_pages1-25.pdf ...).
   The PDF files are never committed (.gitignore). */
window.DG_CONFIG = {
  pdfFolder: "",
  scanFolder: ""
};
