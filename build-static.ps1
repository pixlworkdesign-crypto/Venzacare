# Generates a static HTML preview of the Venza Care UK public site
# (no Node required). Output: preview\  — open preview\index.html in a browser.

$ErrorActionPreference = 'Stop'
$enc  = New-Object System.Text.UTF8Encoding($false)
$root = $PSScriptRoot
$out  = Join-Path $root 'preview'

# --- fresh output folder + assets ---
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory -Force -Path $out | Out-Null
Copy-Item (Join-Path $root 'public\css')    (Join-Path $out 'css')    -Recurse
Copy-Item (Join-Path $root 'public\js')     (Join-Path $out 'js')     -Recurse
Copy-Item (Join-Path $root 'public\images') (Join-Path $out 'images') -Recurse
if (Test-Path (Join-Path $root 'public\guides')) { Copy-Item (Join-Path $root 'public\guides') (Join-Path $out 'guides') -Recurse }

function E($s){ if($null -eq $s){return ''}; return ([string]$s).Replace('&','&amp;').Replace('<','&lt;').Replace('>','&gt;') }
function W($name,$html){ [System.IO.File]::WriteAllText((Join-Path $out $name), $html, $enc) }

# ------------------------------------------------------------------ DATA
$SITE = @{
  name='Venza Care UK'; phone='0800 470 1925'; email='enquiries@venzacare.co.uk'
  address='Venza Care UK Ltd, 1 Croydon Gateway, Croydon CR0 2AB'
  regions=@('London','Kent','Cambridgeshire')
}
$phoneTel = ($SITE.phone -replace '\s','')

$homes = @(
  [ordered]@{ id='croydon-house'; name='Albany Lodge'; town='Croydon'; postcode='CR0 2BZ'; region='London'; lat=51.3727; lng=-0.1099; beds=100; cqc='Registered'; careTypes=@('Residential Care','Nursing Care','Dementia Care','Respite Care','End-of-life Care'); blurb='One of our largest homes, a warm and busy place in the heart of Croydon, offering residential, nursing and dementia care for up to 100 residents.'; photo='albany/exterior.webp'; dementiaNote='Residential and nursing dementia care, for people living with mild, moderate and advanced dementia.'; specialisms=@('Parkinson''s disease','Stroke recovery','COPD & pulmonary disease','Convalescent care','Mental health support','Physical disability','Visual & hearing impairment'); gallery=@('albany/01.webp','albany/02.webp','albany/03.webp','albany/04.webp') }
  [ordered]@{ id='ealing-lodge'; name='Kippingtons'; town='Sevenoaks'; postcode='TN13 2PG'; region='Kent'; lat=51.2722; lng=0.1900; beds=55; cqc='Good'; careTypes=@('Residential Care','Nursing Care','Dementia Care','Respite Care','End-of-life Care'); blurb='A welcoming care home set in a characterful manor in the heart of Sevenoaks, offering residential, nursing and dementia care.'; photo='kippingtons/exterior.webp'; dementiaNote='Residential and nursing dementia care, for people living with mild to moderate dementia.'; specialisms=@('Parkinson''s disease','Stroke recovery','COPD & pulmonary disease','Convalescent care','Acquired brain injury (ABI)'); gallery=@('kippingtons/01.webp','kippingtons/02.webp','kippingtons/03.webp','kippingtons/04.webp','kippingtons/05.webp','kippingtons/06.webp','kippingtons/07.webp','kippingtons/08.webp','kippingtons/09.webp','kippingtons/10.webp','kippingtons/11.webp') }
  [ordered]@{ id='enfield-court'; name='Kentford Manor'; town='Newmarket'; postcode='CB8 8JY'; region='Cambridgeshire'; lat=52.2453; lng=0.4040; beds=88; cqc='Good'; careTypes=@('Residential Care','Nursing Care','Dementia Care','Respite Care','End-of-life Care'); blurb='A spacious, modern home near Newmarket offering residential, nursing, dementia and end-of-life care.'; photo='kentford/exterior.webp'; dementiaNote='Residential and nursing dementia care, for people living with mild, moderate and advanced dementia.'; specialisms=@('Convalescent care','Physical disability'); gallery=@('kentford/01.webp','kentford/02.webp','kentford/03.webp','kentford/04.webp','kentford/05.webp','kentford/06.webp','kentford/07.webp','kentford/08.webp','kentford/09.webp','kentford/10.webp','kentford/11.webp','kentford/12.webp','kentford/13.webp','kentford/14.webp','kentford/15.webp','kentford/16.webp','kentford/17.webp') }
  [ordered]@{ id='bedford-grange'; name='Fieldway'; town='Mitcham'; postcode='CR4 4SJ'; region='London'; lat=51.4006; lng=-0.1540; beds=68; cqc='Good'; careTypes=@('Residential Care','Nursing Care','Dementia Care','Respite Care','End-of-life Care'); blurb='A friendly home in Mitcham offering residential, nursing and dementia care, with a dedicated dementia floor.'; photo='fieldway/exterior.webp'; dementiaNote='Residential and nursing dementia care, for people living with moderate dementia. Fieldway has a dedicated dementia floor.'; specialisms=@('Parkinson''s disease','Stroke recovery','Convalescent care','Physical disability','Visual & hearing impairment'); gallery=@('fieldway/01.webp','fieldway/02.webp','fieldway/03.webp','fieldway/04.webp','fieldway/05.webp','fieldway/06.webp') }
)

$jobs = @(
  [ordered]@{ id='rn-croydon'; title='Registered Nurse (RGN)'; service='Nursing Care'; location='London — Croydon'; homeId='croydon-house'; employmentType='Full-time'; salary='£38,000 – £44,000 per year'; hours='36 hours/week, days or nights'; summary='Lead person-centred nursing care for residents at Albany Lodge in Croydon.'; description='We''re looking for a compassionate Registered Nurse to join the team at Albany Lodge in Croydon. You''ll assess, plan and deliver high-quality nursing care, supporting residents with a range of needs while leading and mentoring the care team on shift.'; responsibilities=@('Assess, plan, implement and evaluate individual care','Lead and support the care team on shift','Manage medication safely and accurately','Work closely with GPs, families and community health teams'); requirements=@('Valid NMC PIN','Right to work in the UK','A caring, person-centred approach','Experience in a care home or similar setting (desirable)'); featured=$true }
  [ordered]@{ id='carer-ealing'; title='Care Assistant'; service='Residential Care'; location='Sevenoaks'; homeId='ealing-lodge'; employmentType='Full-time'; salary='£12.60 – £13.40 per hour'; hours='Full and part-time, days or nights'; summary='Help residents at Kippingtons live well, with kindness and dignity, every day.'; description='As a Care Assistant at Kippingtons in Sevenoaks, you''ll support residents with daily living — washing, dressing, meals and companionship — helping them keep their independence and enjoy their day. No experience needed; we fund your Care Certificate.'; responsibilities=@('Support residents with personal care and daily routines','Help at mealtimes and with activities','Build genuine relationships with residents and families','Keep accurate care records'); requirements=@('A warm, caring nature','Right to work in the UK','No experience required — full training given'); featured=$true }
  [ordered]@{ id='senior-carer-bedford'; title='Senior Care Assistant'; service='Dementia Care'; location='Mitcham'; homeId='bedford-grange'; employmentType='Full-time'; salary='£13.80 – £14.60 per hour'; hours='38.5 hours/week'; summary='Lead a dedicated care team in our dementia household at Fieldway in Mitcham.'; description='We''re seeking an experienced Senior Care Assistant to help lead our dementia household at Fieldway in Mitcham. You''ll supervise shifts, support medication rounds and mentor newer carers, while delivering outstanding hands-on care.'; responsibilities=@('Supervise and support the care team on shift','Lead person-centred dementia care','Administer medication in line with policy','Mentor and induct new colleagues'); requirements=@('NVQ/Diploma Level 3 in Health & Social Care (or working towards)','Experience in dementia care','Right to work in the UK'); featured=$false }
  [ordered]@{ id='home-manager-enfield'; title='Home Manager'; service='Leadership'; location='Newmarket'; homeId='enfield-court'; employmentType='Full-time'; salary='£55,000 – £65,000 per year'; hours='40 hours/week'; summary='Lead Kentford Manor, with full operational and clinical responsibility for the home.'; description='An exciting opportunity for an experienced Home Manager to lead Kentford Manor near Newmarket. You''ll hold overall responsibility for the home''s quality, compliance, people and commercial performance, ensuring outstanding care for every resident.'; responsibilities=@('Lead all aspects of the home''s operation','Ensure CQC compliance and continuous improvement','Develop, support and retain a high-performing team','Build relationships with families, commissioners and the community'); requirements=@('Proven registered manager experience','NMC PIN or relevant management qualification','Strong knowledge of CQC standards','Right to work in the UK'); featured=$false }
  [ordered]@{ id='chef-croydon'; title='Head Chef'; service='Hospitality & Support'; location='London — Croydon'; homeId='croydon-house'; employmentType='Full-time'; salary='£32,000 per year'; hours='40 hours/week'; summary='Create nutritious, delicious meals residents look forward to at Albany Lodge.'; description='We''re looking for a Head Chef to lead the kitchen at Albany Lodge in Croydon. You''ll design seasonal menus, cater for special dietary needs and create the kind of food that makes mealtimes a highlight of the day.'; responsibilities=@('Plan and cook fresh, seasonal menus','Cater for special diets (texture-modified, diabetic, etc.)','Manage kitchen stock, budgets and food safety','Lead and develop the kitchen team'); requirements=@('Professional cookery qualification','Experience catering for special diets (desirable)','Food hygiene certificate','Right to work in the UK'); featured=$false }
  [ordered]@{ id='activities-bedford'; title='Activities Coordinator'; service='Hospitality & Support'; location='Mitcham'; homeId='bedford-grange'; employmentType='Part-time'; salary='£12.80 per hour'; hours='24 hours/week'; summary='Bring energy, fun and meaning to residents'' days at Fieldway in Mitcham.'; description='Help our Fieldway residents in Mitcham live full, engaged lives. You''ll plan and run a varied programme of activities and outings shaped around what residents actually enjoy — from gardening and music to trips out and one-to-one time.'; responsibilities=@('Plan and deliver a varied activities programme','Organise outings and special events','Support residents one-to-one, including those living with dementia','Involve families and the local community'); requirements=@('Creative, energetic and warm','Experience in a similar role (desirable)','Right to work in the UK'); featured=$false }
)

# ------------------------------------------------------------------ PARTIALS
function Header($active,$title){
  $t = if($title){ (E $title) + ' · ' } else { '' }
  function na($k){ if($active -eq $k){'is-active'}else{''} }
@"
<!DOCTYPE html>
<html lang="en-GB">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>$t$(E $SITE.name)</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="css/styles.css" />
<link rel="icon" type="image/png" href="images/logo.png" />
</head>
<body class="page">
<header class="nav">
  <div class="nav__inner">
    <a href="index.html" class="brand" aria-label="Venza Care UK home">
      <img src="images/logo.png" alt="Venza Care" class="brand__logo" />
      <span class="brand__uk">United<br />Kingdom</span>
    </a>
    <nav class="nav__links" id="navlinks">
      <a href="our-care.html" class="$(na 'our-care')">Our care</a>
      <a href="care-homes.html" class="$(na 'care-homes')">Our homes</a>
      <a href="contact.html" class="$(na 'contact')">Contact</a>
    </nav>
    <div class="nav__cta">
      <a href="tel:$phoneTel" class="nav__call"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z"/></svg> Call us</a>
      <a href="contact.html" class="btn btn--primary btn--sm">Book a visit</a>
    </div>
    <button class="nav-toggle" aria-label="Toggle menu" aria-expanded="false"><span></span><span></span><span></span></button>
  </div>
</header>
<main>
"@
}

function Footer{
@"
</main>
<footer class="footer">
  <div class="container">
    <div class="footer__grid">
      <div>
        <img src="images/logo-white.png" alt="Venza Care UK" class="footer__logo" />
        <p style="max-width: 32ch; font-size: 0.92rem;">Four CQC-regulated care homes across London and Bedford — residential, nursing, dementia and end-of-life care.</p>
        <p style="font-size: 0.9rem;">$(E $SITE.address)<br /><a href="tel:$phoneTel">$(E $SITE.phone)</a> · <a href="mailto:$($SITE.email)">$(E $SITE.email)</a></p>
      </div>
      <div><h4>Our care</h4><a href="our-care.html">Residential care</a><a href="our-care.html">Nursing care</a><a href="our-care.html">Dementia care</a><a href="our-care.html">End-of-life care</a></div>
      <div><h4>Explore</h4><a href="care-homes.html">Find a care home</a><a href="careers.html" target="_blank" rel="noopener">Careers &amp; jobs</a><a href="contact.html">Contact us</a><a href="/admin/login">Staff / admin login</a></div>
      <div><h4>Information</h4><a href="#">CQC ratings</a><a href="#">Fees &amp; funding</a><a href="privacy.html">Privacy policy</a><a href="cookies.html">Cookie policy</a><a href="accessibility.html">Accessibility</a></div>
    </div>
    <div class="footer__bottom"><span>© 2026 Venza Care UK Ltd. Registered in England &amp; Wales. Regulated by the Care Quality Commission.</span><span>Static preview · placeholder content</span></div>
  </div>
</footer>
<button class="venza-chat-btn" id="venzaChatBtn" aria-label="Open chat assistant" aria-expanded="false"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></button>
<div class="venza-chat" id="venzaChat" aria-hidden="true" aria-live="polite">
  <div class="venza-chat__head"><div><strong>Venza Care assistant</strong><span>Ask about our homes, care &amp; jobs</span></div><button class="venza-chat__close" id="venzaChatClose" aria-label="Close chat">&times;</button></div>
  <div class="venza-chat__log" id="venzaChatLog"></div>
  <form class="venza-chat__form" id="venzaChatForm"><input id="venzaChatInput" type="text" autocomplete="off" placeholder="Type your question…" aria-label="Your message" /><button type="submit" aria-label="Send message"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13M22 2 15 22l-4-9-9-4z"/></svg></button></form>
</div>
<div class="call-modal" id="callModal" aria-hidden="true" role="dialog" aria-label="Call us">
  <div class="call-modal__box">
    <button class="call-modal__close" id="callModalClose" aria-label="Close">&times;</button>
    <h3>Call us</h3>
    <a class="call-modal__num" id="callModalNum" href="tel:$phoneTel">$(E $SITE.phone)</a>
    <button class="btn btn--ghost btn--sm" id="callModalCopy" type="button">Copy number</button>
    <p class="call-modal__hint">Lines open Mon-Sun, 8am-8pm. On a phone? <a id="callModalTel" href="tel:$phoneTel">tap to call</a>, or scan to dial:</p>
    <img class="call-modal__qr" id="callModalQr" alt="QR code to call us" width="150" height="150" />
  </div>
</div>
<div class="mobile-cta">
  <a class="mc-call" href="tel:$phoneTel"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z"/></svg> Call us</a>
  <a class="mc-visit" href="contact.html"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg> Book a visit</a>
</div>
<script src="js/main.js"></script>
</body>
</html>
"@
}

# ---- Careers portal chrome (distinct from the main site) ----
function CareersHeader($active,$title){
  $t = if($title){ (E $title) + ' · ' } else { '' }
  function na2($k){ if($active -eq $k){'is-active'}else{''} }
@"
<!DOCTYPE html>
<html lang="en-GB">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${t}Careers · $(E $SITE.name)</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="css/styles.css" />
<link rel="icon" type="image/png" href="images/logo.png" />
</head>
<body class="page careers-portal">
<header class="careers-nav"><div class="careers-nav__inner">
  <a href="careers.html" class="careers-brand"><img src="images/logo.png" alt="Venza Care" class="careers-brand__logo" /><span class="careers-brand__tag">Careers</span></a>
  <button class="nav-toggle" aria-label="Toggle menu" aria-expanded="false"><span></span><span></span><span></span></button>
  <nav class="careers-nav__links" id="navlinks">
    <a href="careers.html" class="$(na2 'careers')">All jobs</a>
    <a href="careers.html#why">Why join us</a>
    <a href="contact.html">Contact HR</a>
    <a href="index.html" class="careers-nav__back">← Main website</a>
  </nav>
</div></header>
<main>
"@
}

function CareersFooter{
@"
</main>
<footer class="careers-footer"><div class="container">
  <div class="careers-footer__inner">
    <div><img src="images/logo-white.png" alt="Venza Care UK" class="careers-footer__logo" /><p>Caring careers across our care homes. We fund recognised qualifications and look after our teams as well as our residents.</p></div>
    <div class="careers-footer__links"><a href="careers.html">All jobs</a><a href="contact.html">Contact HR</a><a href="privacy.html">Privacy</a><a href="index.html">← Back to main website</a></div>
  </div>
  <div class="careers-footer__bottom"><span>© 2026 $(E $SITE.name) Ltd · Careers portal</span><span><a href="tel:$phoneTel">$(E $SITE.phone)</a></span></div>
</div></footer>
<script src="js/main.js"></script>
</body>
</html>
"@
}

# rating chip markup
function RatingChip($cqc,$static){
  $pos = if($static){' style="position:static;display:inline-flex;margin-bottom:1rem;"'}else{''}
  if($cqc -eq 'Good' -or $cqc -eq 'Outstanding'){
    $o = if($cqc -eq 'Outstanding'){'is-outstanding'}else{''}
    "<span class=`"home-card__rating $o`"$pos><svg width=`"13`" height=`"13`" viewBox=`"0 0 24 24`" fill=`"currentColor`"><path d=`"M12 2l2.4 7.4H22l-6 4.6 2.3 7.4L12 17l-6.3 4.4L8 14 2 9.4h7.6z`"/></svg> CQC $(E $cqc)</span>"
  } else {
    "<span class=`"home-card__rating`"$pos><svg width=`"13`" height=`"13`" viewBox=`"0 0 24 24`" fill=`"currentColor`"><path d=`"M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3Z`"/></svg> CQC registered</span>"
  }
}

function HomeCard($h){
  $chips = ($h.careTypes | ForEach-Object { "<span class=`"chip`">$(E $_)</span>" }) -join ''
  $media = "<div class=`"home-card__media has-photo`" style=`"background-image:url('images/$($h.photo)'); background-repeat:no-repeat; background-position:center; background-size:cover;`">$(RatingChip $h.cqc $false)</div>"
  $pc = ($h.postcode.ToLower() -replace '\s','')
  $careAttr = ($h.careTypes -join '|')
@"
<a class="home-card" href="home-$($h.id).html" data-id="$($h.id)" data-name="$(E ($h.name.ToLower()))" data-town="$(E ($h.town.ToLower()))" data-postcode="$pc" data-region="$(E $h.region)" data-care="$(E $careAttr)" data-lat="$($h.lat)" data-lng="$($h.lng)">
  $media
  <div class="home-card__body">
    <span class="home-card__town"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0Z"/><circle cx="12" cy="10" r="3"/></svg>$(E $h.town)</span>
    <h3>$(E $h.name)</h3>
    <p>$(E $h.blurb)</p>
    <div class="chips">$chips</div>
    <span class="btn btn--ghost btn--sm">View this home</span>
  </div>
</a>
"@
}

function JobCard($j){
  $feat = if($j.featured){'<span class="badge badge--featured">Featured</span>'}else{''}
  $sal  = if($j.salary){"<span><svg width=`"14`" height=`"14`" viewBox=`"0 0 24 24`" fill=`"none`" stroke=`"currentColor`" stroke-width=`"2`"><path d=`"M9 13c5 0 5 8 0 8m0-8H6m3 0c4 0 4 8 0 8M6 3h12M6 8h12`"/></svg>$(E $j.salary)</span>"}else{''}
@"
<a class="job-card" href="job-$($j.id).html">
  <div class="job-card__top">
    <div><span class="badge badge--service">$(E $j.service)</span> $feat<h3 style="margin-top:0.7rem;">$(E $j.title)</h3></div>
    <span class="btn btn--ghost btn--sm">View job</span>
  </div>
  <div class="job-card__meta">
    <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0Z"/><circle cx="12" cy="10" r="3"/></svg>$(E $j.location)</span>
    <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>$(E $j.employmentType)</span>
    $sal
  </div>
  <p class="muted" style="margin:0;">$(E $j.summary)</p>
</a>
"@
}

# ------------------------------------------------------------------ HOME PAGE
$careTypesHome = @(
  @{t='Residential care'; img='care-residential.jpg'; pos='center top'; d='Help with everyday things — washing, dressing, meals and medication — in a comfortable home, while keeping as much independence as you like.'}
  @{t='Nursing care'; img='care-nursing.jpg'; pos='center top'; d='Round-the-clock care from registered nurses for ongoing medical needs and long-term health conditions.'}
  @{t='Dementia care'; img='care-dementia.jpg'; pos='center top'; d='Care from teams experienced in dementia, in calm, familiar surroundings that help residents feel settled and understood.'}
  @{t='End-of-life care'; img='care-palliative.jpg'; pos='center'; d='Gentle, dignified care in the final months, working closely with your GP and family. Available at Kentford Manor.'}
)
$careCards = ($careTypesHome | ForEach-Object {
@"
<a class="care-card" href="our-care.html">
  <div class="care-card__media" style="background-image:url('images/$($_.img)'); background-position: $($_.pos);"></div>
  <div class="care-card__body"><h3>$(E $_.t)</h3><p>$(E $_.d)</p><span class="care-card__link">Learn more <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span></div>
</a>
"@ }) -join "`n"

$featuredHomes = ($homes | ForEach-Object { HomeCard $_ }) -join "`n"
$featuredJobs  = (($jobs | Where-Object { $_.featured }) | Select-Object -First 3 | ForEach-Object { JobCard $_ }) -join "`n"
$openCount = ($jobs).Count
$statBeds = ($homes | ForEach-Object { $_.beds } | Measure-Object -Sum).Sum
$statHomes = $homes.Count
$statCareTypes = ($homes | ForEach-Object { $_.careTypes } | Select-Object -Unique).Count
$regionOpts = ($SITE.regions | ForEach-Object { "<option value=`"$_`">$_</option>" }) -join ''
$careOpts = (@('Residential Care','Nursing Care','Dementia Care','Respite Care','End-of-life Care') | ForEach-Object { "<option value=`"$_`">$_</option>" }) -join ''

$guides = @(
  @{t='A guide to choosing a care home'; d='What to look for, questions to ask and how to know it feels right.'; pdf='guides/choosing-a-care-home.pdf'}
  @{t='Understanding fees &amp; funding'; d='NHS, local authority and self-funding explained in plain English.'; pdf='guides/understanding-fees-and-funding.pdf'}
  @{t='Living well with dementia'; d='Practical advice and reassurance for families and carers.'; pdf='guides/living-well-with-dementia.pdf'}
  @{t='Making the move easier'; d='How to help a loved one settle in and feel at home quickly.'; pdf='guides/making-the-move-easier.pdf'}
)
$guideCards = ($guides | ForEach-Object {
@"
<div class="guide-card"><div class="ic"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4H6.5A2.5 2.5 0 0 0 4 6.5v13ZM4 19.5A2.5 2.5 0 0 0 6.5 22H20"/></svg></div><h4>$($_.t)</h4><p>$($_.d)</p><a href="$($_.pdf)" class="care-card__link" download target="_blank" rel="noopener">Download free <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16"/></svg></a></div>
"@ }) -join "`n"

$values = @(
  @{t='Known, not just cared for'; d='A named carer who learns your routines, your stories and the little things that make a day feel right.'}
  @{t='Care that adapts'; d='Residential, nursing and dementia care under one roof, so as needs change your loved one rarely has to move home.'}
  @{t='Family always welcome'; d='Open visiting, a named contact at each home, and a team that picks up the phone whenever you need to talk.'}
)
$valueCards = ($values | ForEach-Object {
@"
<div class="quote-card"><div class="care-card__icon" style="margin-bottom:1rem;"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg></div><h3 style="font-size:1.2rem;">$(E $_.t)</h3><p style="color:var(--muted);margin:0;">$(E $_.d)</p></div>
"@ }) -join "`n"

$homePage = Header 'home' ''
$homePage += @"
<section class="hero has-photo" style="background-image: linear-gradient(100deg, rgba(13,79,92,0.88) 0%, rgba(13,79,92,0.6) 46%, rgba(17,93,108,0.32) 100%), url('images/hero-home.jpg'); background-size: cover; background-position: center;">
  <div class="hero__inner">
    <span class="eyebrow hero__eyebrow">Residential · Nursing · Dementia · End-of-life care</span>
    <h1>The care home you'd choose for your own family</h1>
    <p class="hero__lead">Four care homes across London and Bedford — offering residential, nursing and dementia care, all registered and inspected by the Care Quality Commission.</p>
    <div class="hero__cta"><a href="care-homes.html" class="btn btn--gold">Find a care home</a><a href="careers.html" class="btn btn--outline-light">Explore careers</a></div>
  </div>
</section>
<div class="finder-band"><div class="container"><div class="finder">
  <h3>Find your nearest Venza Care home</h3>
  <form action="care-homes.html" method="get">
    <div class="field"><label for="f-q">Town or postcode</label><input type="text" id="f-q" name="q" placeholder="e.g. Croydon or CR0" /></div>
    <div class="field"><label for="f-region">Region</label><select id="f-region" name="region"><option value="">All regions</option>$regionOpts</select></div>
    <div class="field"><label for="f-care">Type of care</label><select id="f-care" name="careType"><option value="">Any care</option>$careOpts</select></div>
    <button type="submit" class="btn btn--primary">Search</button>
  </form>
</div></div></div>
<div class="trustbar"><div class="trustbar__inner">
  <span class="trustbar__item"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3Z"/></svg> <strong>CQC&nbsp;regulated</strong></span>
  <span class="trustbar__item"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6"/></svg> <strong>4</strong> care homes</span>
  <span class="trustbar__item"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0Z"/><circle cx="12" cy="10" r="3"/></svg> London · Bedford</span>
  <span class="trustbar__item"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg> Family always welcome</span>
</div></div>
<section class="section section--alt"><div class="container"><div class="split">
  <div class="split__media split__media--bordered has-photo" style="background-image:url('images/life.jpg');"></div>
  <div><span class="eyebrow">Life in our homes</span><h2 class="h2">There's more to the day than care</h2><p class="lead">Good days are made of small things — something to do, a proper meal, time outdoors and a visit from the people who matter. Each home runs its own programme of activities shaped around what residents actually enjoy.</p>
  <ul style="list-style:none;padding:0;margin:1.5rem 0;display:grid;gap:0.8rem;">
    <li style="display:flex;gap:0.7rem;align-items:flex-start;"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#20a7bc" stroke-width="2.2" style="flex:none;margin-top:2px"><path d="M20 6 9 17l-5-5"/></svg><span>A regular programme of activities and outings</span></li>
    <li style="display:flex;gap:0.7rem;align-items:flex-start;"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#20a7bc" stroke-width="2.2" style="flex:none;margin-top:2px"><path d="M20 6 9 17l-5-5"/></svg><span>Freshly prepared meals, with special diets catered for</span></li>
    <li style="display:flex;gap:0.7rem;align-items:flex-start;"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#20a7bc" stroke-width="2.2" style="flex:none;margin-top:2px"><path d="M20 6 9 17l-5-5"/></svg><span>Comfortable lounges and gardens to enjoy</span></li>
    <li style="display:flex;gap:0.7rem;align-items:flex-start;"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#20a7bc" stroke-width="2.2" style="flex:none;margin-top:2px"><path d="M20 6 9 17l-5-5"/></svg><span>Family and friends always welcome</span></li>
  </ul>
  <a href="our-care.html" class="btn btn--primary">More about life with us</a></div>
</div></div></section>
<section class="section section--alt about-split"><div class="container"><div class="split split--reverse">
  <div class="split__media split__media--bordered has-photo" style="background-image:url('images/about.jpg');"></div>
  <div><span class="eyebrow">About Venza Care</span><h2 class="h2">Care that starts with getting to know you</h2><p class="lead">Across our four homes in London and Bedford, around 300 people live the way they want to — a lie-in if they fancy one, a garden to potter in, a cup of tea made just how they like it. We offer residential, nursing, dementia and end-of-life care, but it always begins with the person, never the task.</p><p>Our carers and nurses take time to learn the little things — the name of a grandchild, a favourite song, the routine that makes a day feel right. Every home is registered with and inspected by the Care Quality Commission.</p><div class="hero__cta" style="margin-top:1.5rem;"><a href="our-care.html" class="btn btn--primary">Our approach to care</a><a href="care-homes.html" class="btn btn--ghost">Find a home</a></div></div>
</div></div></section>
<section class="section section--green"><div class="container">
<div class="section-head center" style="margin-inline:auto;"><span class="eyebrow" style="color:var(--gold-400)">Venza Care at a glance</span><h2 class="h2" style="color:#fff;">Trusted care, by the numbers</h2></div>
<div class="stats">
  <div class="stat"><div class="stat__num">$statHomes</div><div class="stat__label">Care homes</div></div>
  <div class="stat"><div class="stat__num">$statBeds</div><div class="stat__label">Beds across our homes</div></div>
  <div class="stat"><div class="stat__num">$statCareTypes</div><div class="stat__label">Types of care, from residential to nursing</div></div>
  <div class="stat"><div class="stat__num">24/7</div><div class="stat__label">Registered nursing on site</div></div>
</div></div></section>
<section class="section section--alt"><div class="container">
  <div class="section-head center"><span class="eyebrow">Help &amp; advice</span><h2 class="h2">Free guides for families</h2><p class="lead" style="margin-inline:auto;">Choosing care can feel overwhelming. Our friendly guides break it all down — at no cost and no obligation.</p></div>
  <div class="guides">$guideCards</div>
</div></section>
<section class="section"><div class="container">
  <div class="section-head center"><span class="eyebrow">Why families choose us</span><h2 class="h2">The things that matter most</h2><p class="lead" style="margin-inline:auto;">Choosing a care home is one of the hardest decisions a family makes. Here's what you can count on from every Venza Care home.</p></div>
  <div class="testi-grid">$valueCards</div>
</div></section>
<section class="section" style="padding-top:0;"><div class="container"><div class="cta-band" style="background:linear-gradient(120deg,var(--green-800),var(--green-600));">
  <h2>Looking for care? Let's talk.</h2><p>Tell us what you need and we'll check availability across our four homes. Call us, or book a visit and we'll come back to you within one working day.</p><a href="tel:$phoneTel" class="btn btn--gold btn--call"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z"/></svg> Call $(E $SITE.phone)</a><a href="contact.html" class="btn btn--outline-light">Book a visit</a><a href="contact.html#callback" class="btn btn--outline-light">Request a callback</a>
</div></div></section>
"@
$homePage += Footer
W 'index.html' $homePage

# ------------------------------------------------------------------ OUR CARE
$careDetail = @(
  @{t='Residential care'; img='care-residential.jpg'; pos='center 22%'; d='For people who no longer manage easily at home, residential care offers help with everyday things — washing, dressing, meals and medication — in a comfortable home, with a team on hand day and night. You keep your own routines and as much independence as you like.'}
  @{t='Nursing care'; img='care-nursing.jpg'; pos='center 22%'; d='When health needs go beyond day-to-day support, our registered nurses provide care around the clock — for long-term conditions, recovery after a hospital stay, and ongoing clinical needs — working closely with local GPs and community health teams.'}
  @{t='Dementia care'; img='care-dementia.jpg'; pos='center 22%'; d='Our teams are experienced in caring for people living with dementia, in calm, familiar surroundings designed to feel safe. We take time to learn each resident''s history and routines, so they are known and understood — including on the harder days. At Fieldway in Mitcham, a dedicated floor specialises in dementia care.'}
  @{t='End-of-life care'; img='care-palliative.jpg'; pos='center'; d='In someone''s final months, our focus is comfort, dignity and choice. We work closely with your GP, district nurses and family to manage symptoms and make sure no one is alone. End-of-life care is available at Kentford Manor, near Newmarket.'}
)
$i=0
$careBlocks = ($careDetail | ForEach-Object {
  $rev = if($i % 2){'split--reverse'}else{''}; $i++
@"
<div class="split $rev" style="margin-bottom: 3.5rem;"><div class="split__media split__media--bordered has-photo" style="background-image:url('images/$($_.img)'); background-position: $($_.pos);"></div><div><h2 class="h2" style="font-size:1.9rem;">$(E $_.t)</h2><p class="lead" style="font-size:1.05rem;">$(E $_.d)</p><a href="care-homes.html" class="btn btn--ghost mt-1">Find $($_.t.ToLower()) homes</a></div></div>
"@ }) -join "`n"

$oc = Header 'our-care' 'Our care'
$oc += @"
<section class="page-hero"><div class="container"><div class="crumbs"><a href="index.html">Home</a> › Our care</div><span class="eyebrow hero__eyebrow">Our care</span><h1>Care that grows as needs change</h1><p>From a little help each day to round-the-clock nursing and specialist dementia care, our four homes support people as their needs change. Here's what each kind of care actually means.</p></div></section>
<section class="section"><div class="container">$careBlocks</div></section>
<section class="section" style="padding-top:0;"><div class="container"><div class="cta-band" style="background:linear-gradient(120deg,var(--green-800),var(--green-600));"><h2>Not sure which kind of care fits?</h2><p>Tell us about your situation and we'll talk it through — and point you to the right home, or be honest if we're not the best fit. We reply to every enquiry within one working day.</p><a href="contact.html" class="btn btn--gold">Book a visit</a><a href="care-homes.html" class="btn btn--outline-light">Find a home</a></div></div></section>
"@
$oc += Footer
W 'our-care.html' $oc

# ------------------------------------------------------------------ CARE HOMES (listing)
$allHomeCards = ($homes | ForEach-Object { HomeCard $_ }) -join "`n"
$ch = Header 'care-homes' 'Find a care home'
$ch += @"
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="" />
<section class="page-hero"><div class="container"><div class="crumbs"><a href="index.html">Home</a> › Find a home</div><span class="eyebrow hero__eyebrow">Our homes</span><h1>Find a Venza Care home</h1><p>Search by town, region or the type of care you need — or use your location to find your nearest home.</p></div></section>
<section class="section"><div class="container">
  <div class="finder" style="max-width:none;margin-top:0;margin-bottom:1.5rem;"><form action="care-homes.html" method="get" id="finderForm">
    <div class="field"><label for="q">Town or postcode</label><input type="text" id="q" name="q" placeholder="e.g. Croydon or CR0" /></div>
    <div class="field"><label for="region">Region</label><select id="region" name="region"><option value="">All regions</option>$regionOpts</select></div>
    <div class="field"><label for="careType">Type of care</label><select id="careType" name="careType"><option value="">Any care</option>$careOpts</select></div>
    <button type="submit" class="btn btn--primary">Search</button>
  </form></div>
  <div class="finder-actions">
    <p class="muted" style="margin:0;"><strong style="color:var(--green-800)"><span id="resultNum">$($homes.Count)</span></strong> home<span id="resultPlural">s</span> found</p>
    <div class="finder-actions__btns">
      <button type="button" class="btn btn--ghost btn--sm" id="useLocation"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-7-6.5-7-11a7 7 0 0 1 14 0c0 4.5-7 11-7 11Z"/><circle cx="12" cy="10" r="2.5"/></svg> Use my location</button>
      <button type="button" class="btn btn--muted btn--sm" id="clearFilters" style="display:none;">Clear</button>
    </div>
  </div>
  <div class="homes-grid">$allHomeCards</div>
  <div class="empty-state" id="emptyState" style="display:none;"><h3>No homes match your search</h3><p>Try widening your search, or <button type="button" class="link-btn" id="emptyClear">view all our homes</button>.</p></div>
  <div id="homes-map" class="homes-map" role="img" aria-label="Map showing the location of our care homes" style="margin-top:2.5rem;margin-bottom:0;"></div>
</div></section>
"@
$mapData = $homes | ForEach-Object { [ordered]@{ id=$_.id; name=$_.name; town=$_.town; postcode=$_.postcode; lat=$_.lat; lng=$_.lng; cqc=$_.cqc; careTypes=$_.careTypes } }
$mapJson = ($mapData | ConvertTo-Json -Compress -Depth 6)
if($homes.Count -eq 1){ $mapJson = "[$mapJson]" }
$mapScript = @'
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<script>
(function(){
  var homesData = __HOMES__;
  var grid=document.querySelector(".homes-grid");
  var cards=grid?Array.prototype.slice.call(grid.querySelectorAll(".home-card")):[];
  var countEl=document.getElementById("resultNum"), pluralEl=document.getElementById("resultPlural"), emptyEl=document.getElementById("emptyState");
  var form=document.getElementById("finderForm"), qEl=document.getElementById("q"), regionEl=document.getElementById("region"), careEl=document.getElementById("careType"), clearBtn=document.getElementById("clearFilters");
  var mapEl=document.getElementById("homes-map"); var map=null, markerById={}, userMarker=null;
  if(mapEl&&window.L){
    map=L.map(mapEl,{scrollWheelZoom:true});
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors"}).addTo(map);
    homesData.forEach(function(h){
      if(typeof h.lat!=="number"||typeof h.lng!=="number")return;
      var gmaps="https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(h.name+", "+h.town+" "+h.postcode);
      var m=L.marker([h.lat,h.lng]);
      m.bindTooltip(h.name+" - "+h.town+" (click for Google Maps)");
      m.on("click",function(){window.open(gmaps,"_blank","noopener");});
      markerById[h.id]=m;
    });
  }
  function norm(s){return (s||"").toString().toLowerCase().replace(/\s+/g,"");}
  function haversine(aLat,aLng,bLat,bLng){var R=3958.8,dLat=(bLat-aLat)*Math.PI/180,dLng=(bLng-aLng)*Math.PI/180;var s=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(aLat*Math.PI/180)*Math.cos(bLat*Math.PI/180)*Math.sin(dLng/2)*Math.sin(dLng/2);return R*2*Math.atan2(Math.sqrt(s),Math.sqrt(1-s));}
  function regionCareOk(card){var region=regionEl?regionEl.value:"",care=careEl?careEl.value:"";return (!region||card.getAttribute("data-region")===region)&&(!care||(card.getAttribute("data-care")||"").split("|").indexOf(care)>-1);}
  function textOk(card,q){if(!q)return true;return norm(card.getAttribute("data-town")).indexOf(q)>-1||norm(card.getAttribute("data-name")).indexOf(q)>-1||(card.getAttribute("data-postcode")||"").indexOf(q)>-1;}
  function anyFilterActive(){return (qEl&&qEl.value)||(regionEl&&regionEl.value)||(careEl&&careEl.value);}
  function render(shown){
    cards.forEach(function(c){c.style.display=shown.indexOf(c)>-1?"":"none";});
    if(countEl)countEl.textContent=shown.length;
    if(pluralEl)pluralEl.textContent=shown.length===1?"":"s";
    if(emptyEl)emptyEl.style.display=shown.length?"none":"";
    if(clearBtn)clearBtn.style.display=anyFilterActive()?"":"none";
    if(map){
      Object.keys(markerById).forEach(function(id){map.removeLayer(markerById[id]);});
      var vis=[]; shown.forEach(function(card){var m=markerById[card.getAttribute("data-id")];if(m){m.addTo(map);vis.push(m);}});
      if(userMarker)userMarker.addTo(map);
      if(vis.length){var g=L.featureGroup(vis); if(vis.length===1)map.setView(vis[0].getLatLng(),13); else map.fitBounds(g.getBounds().pad(0.2));}
    }
  }
  function apply(){var q=norm(qEl?qEl.value:""); var shown=cards.filter(function(c){return regionCareOk(c)&&textOk(c,q);}); render(shown); return shown;}
  function sortByPoint(plat,plng,list,markerLabel){
    list.forEach(function(card){
      var lat=parseFloat(card.getAttribute("data-lat")),lng=parseFloat(card.getAttribute("data-lng"));
      var d=(isFinite(lat)&&isFinite(lng))?haversine(plat,plng,lat,lng):Infinity; card._dist=d;
      var badge=card.querySelector(".home-card__dist");
      if(!badge){badge=document.createElement("span");badge.className="home-card__dist";var body=card.querySelector(".home-card__body");if(body)body.insertBefore(badge,body.firstChild);}
      badge.textContent=isFinite(d)?("~"+(Math.round(d*10)/10)+" miles away"):"";
    });
    list.sort(function(a,b){return a._dist-b._dist;});
    list.forEach(function(card){grid.appendChild(card);});
    if(map){if(userMarker)map.removeLayer(userMarker);userMarker=L.circleMarker([plat,plng],{radius:7,color:"#15677a",fillColor:"#20a7bc",fillOpacity:0.9,weight:2}).bindTooltip(markerLabel||"Your location");userMarker.addTo(map);}
  }
  function looksLikePostcode(q){return /^[a-z]{1,2}\d/i.test(q.replace(/\s/g,""));}
  function geocodePostcode(q){
    function tryUrl(u){return fetch(u).then(function(r){return r.ok?r.json():null;}).then(function(d){return (d&&d.result&&typeof d.result.latitude==="number")?{lat:d.result.latitude,lng:d.result.longitude}:null;}).catch(function(){return null;});}
    var full=q.trim().replace(/\s+/g,"");
    return tryUrl("https://api.postcodes.io/postcodes/"+encodeURIComponent(full)).then(function(res){ if(res)return res; var outcode=q.trim().split(/\s+/)[0]; return tryUrl("https://api.postcodes.io/outcodes/"+encodeURIComponent(outcode)); });
  }
  var searchBtn=form?form.querySelector("button[type=submit]"):null;
  function doSearch(){
    var raw=qEl?qEl.value.trim():"";
    if(raw&&looksLikePostcode(raw)){
      var base=cards.filter(regionCareOk);
      var lbl=searchBtn?searchBtn.textContent:"";
      if(searchBtn){searchBtn.textContent="Searching...";searchBtn.disabled=true;}
      geocodePostcode(raw).then(function(pt){
        if(searchBtn){searchBtn.textContent=lbl||"Search";searchBtn.disabled=false;}
        if(pt){render(base);sortByPoint(pt.lat,pt.lng,base,"Near "+raw.toUpperCase());if(clearBtn)clearBtn.style.display="";}
        else{apply();}
      });
    } else { apply(); }
  }
  var params=new URLSearchParams(location.search);
  if(qEl&&params.get("q"))qEl.value=params.get("q");
  if(regionEl&&params.get("region"))regionEl.value=params.get("region");
  if(careEl&&params.get("careType"))careEl.value=params.get("careType");
  doSearch();
  if(form)form.addEventListener("submit",function(e){e.preventDefault();doSearch();});
  [regionEl,careEl].forEach(function(el){if(el)el.addEventListener("change",doSearch);});
  function clearAll(){if(qEl)qEl.value="";if(regionEl)regionEl.value="";if(careEl)careEl.value="";if(userMarker&&map){map.removeLayer(userMarker);userMarker=null;}apply();}
  if(clearBtn)clearBtn.addEventListener("click",clearAll);
  var emptyClear=document.getElementById("emptyClear"); if(emptyClear)emptyClear.addEventListener("click",clearAll);
  var locBtn=document.getElementById("useLocation");
  if(locBtn){
    if(!navigator.geolocation){locBtn.style.display="none";}
    else{
      locBtn.addEventListener("click",function(){
        var label=locBtn.innerHTML; locBtn.textContent="Locating..."; locBtn.disabled=true;
        navigator.geolocation.getCurrentPosition(function(pos){
          var base=cards.filter(regionCareOk); render(base); sortByPoint(pos.coords.latitude,pos.coords.longitude,base,"You are here"); if(clearBtn)clearBtn.style.display="";
          locBtn.innerHTML=label; locBtn.disabled=false;
        },function(){locBtn.innerHTML=label;locBtn.disabled=false;alert("We could not get your location. Please allow location access in your browser, or search by town or postcode instead.");});
      });
    }
  }
})();
</script>
'@
$ch += $mapScript.Replace('__HOMES__', $mapJson)
$ch += Footer
W 'care-homes.html' $ch

# ------------------------------------------------------------------ HOME DETAIL PAGES
foreach($h in $homes){
  $careTicks = ($h.careTypes | ForEach-Object { "<li><svg width=`"18`" height=`"18`" viewBox=`"0 0 24 24`" fill=`"none`" stroke=`"currentColor`" stroke-width=`"2.4`" stroke-linecap=`"round`" stroke-linejoin=`"round`"><path d=`"M20 6 9 17l-5-5`"/></svg><span>$(E $_)</span></li>" }) -join ''
  $demNote = if($h.dementiaNote){"<p class=`"muted`" style=`"font-size:0.9rem;margin:0.25rem 0 0;`">$(E $h.dementiaNote)</p>"}else{''}
  $specs = ''
  if($h.specialisms.Count){
    $specTicks = ($h.specialisms | ForEach-Object { "<li><svg width=`"18`" height=`"18`" viewBox=`"0 0 24 24`" fill=`"none`" stroke=`"currentColor`" stroke-width=`"2.4`" stroke-linecap=`"round`" stroke-linejoin=`"round`"><path d=`"M20 6 9 17l-5-5`"/></svg><span>$(E $_)</span></li>" }) -join ''
    $specs = "<h3>Specialist care we support</h3><ul class=`"tick-list`">$specTicks</ul>"
  }
  $gallery = ''
  if($h.gallery.Count){
    $gi=0
    $items = ($h.gallery | ForEach-Object { $gi++; "<button type=`"button`" class=`"gallery-item`" data-full=`"images/$_`" aria-label=`"View photo $gi`" style=`"background-image:url('images/$_');`"></button>" }) -join ''
    $gallery = @"
<div style="margin-top:3.5rem;"><h2 class="h2" style="font-size:1.6rem;">A look around $(E $h.name)</h2><div class="gallery-grid">$items</div></div>
<div class="lightbox" id="lightbox" aria-hidden="true"><button type="button" class="lightbox__close" aria-label="Close">&times;</button><button type="button" class="lightbox__nav lightbox__prev" aria-label="Previous photo">&#8249;</button><img class="lightbox__img" src="" alt="$(E $h.name) photo" /><button type="button" class="lightbox__nav lightbox__next" aria-label="Next photo">&#8250;</button></div>
"@
  }
  $homeJobs = $jobs | Where-Object { $_.homeId -eq $h.id }
  $jobsBlock = ''
  if($homeJobs.Count){
    $jc = ($homeJobs | ForEach-Object {
      "<a class=`"job-card`" href=`"job-$($_.id).html`"><div class=`"job-card__top`"><div><span class=`"badge badge--service`">$(E $_.service)</span><h3 style=`"margin-top:0.6rem;`">$(E $_.title)</h3></div><span class=`"btn btn--ghost btn--sm`">View job</span></div><p class=`"muted`" style=`"margin:0.5rem 0 0;`">$(E $_.summary)</p></a>"
    }) -join "`n"
    $jobsBlock = "<div style=`"margin-top:3.5rem;`"><h2 class=`"h2`" style=`"font-size:1.6rem;`">Careers at $(E $h.name)</h2><div class=`"job-list`" style=`"margin-top:1.2rem;`">$jc</div></div>"
  }
  $cqcFact = if($h.cqc -eq 'Good' -or $h.cqc -eq 'Outstanding'){ $h.cqc }else{ 'Registered' }
  $cqcLine = if($h.cqc -eq 'Good' -or $h.cqc -eq 'Outstanding'){ " It is rated <strong>$(E $h.cqc)</strong> by the Care Quality Commission, and you can read the full inspection report on the CQC website." }else{ ' It is registered with and inspected by the Care Quality Commission.' }
  $careTypesLower = (($h.careTypes -join ', ').ToLower())

  $pg = Header 'care-homes' $h.name
  $pg += @"
<section class="page-hero has-photo" style="background-color: var(--green-800); background-image: linear-gradient(90deg, rgba(13,79,92,0.96) 0%, rgba(13,79,92,0.72) 30%, rgba(13,79,92,0.15) 52%, rgba(13,79,92,0) 66%), url('images/$($h.photo)'); background-repeat: no-repeat, no-repeat; background-position: center, right center; background-size: cover, contain;">
  <div class="container"><div class="crumbs"><a href="index.html">Home</a> › <a href="care-homes.html">Find a home</a> › $(E $h.name)</div>
  $(RatingChip $h.cqc $true)
  <h1>$(E $h.name)</h1><p><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0Z"/><circle cx="12" cy="10" r="3"/></svg> $(E $h.town) · $(E $h.postcode)</p></div>
</section>
<section class="section"><div class="container"><div class="job-detail">
  <div class="prose">
    <p class="lead">$(E $h.blurb)</p>
    <h2>About this home</h2>
    <p>$(E $h.name) is a $($h.beds)-bed care home in $(E $h.town), offering $careTypesLower.$cqcLine</p>
    <div class="care-panel">
      <h3>Types of care</h3><ul class="tick-list">$careTicks</ul>$demNote
      $specs
      <h3>Facilities &amp; daily life</h3>
      <div class="facility-grid">
        <div class="fac"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/></svg><span>Comfortable lounges &amp; gardens</span></div>
        <div class="fac"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h18a9 9 0 0 1-18 0zM8 4v3M12 3v4M16 4v3"/></svg><span>Freshly prepared meals, special diets catered for</span></div>
        <div class="fac"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V6l12-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z"/></svg><span>Daily activities &amp; outings</span></div>
        <div class="fac"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h18v6M3 18v-8a1 1 0 0 1 1-1h7v5"/></svg><span>En-suite rooms you can make your own</span></div>
        <div class="fac"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-8 0v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/></svg><span>Open visiting — family welcome any time</span></div>
      </div>
    </div>
  </div>
  <aside class="apply-card"><h3>Arrange a visit</h3><p class="muted" style="margin-top:0;">The best way to judge $(E $h.name) is to see it for yourself. Arrange a visit and we'll show you around and answer your questions — no obligation.</p>
    <ul class="job-facts"><li><span>CQC</span><span>$(E $cqcFact)</span></li><li><span>Beds</span><span>$($h.beds)</span></li><li><span>Location</span><span>$(E $h.town) · $(E $h.postcode)</span></li><li><span>Enquiries</span><span><a href="tel:$phoneTel">$(E $SITE.phone)</a></span></li></ul>
    <a href="contact.html" class="btn btn--primary btn--block">Book a visit</a><a href="tel:$phoneTel" class="btn btn--ghost btn--block mt-1">Call our team</a></aside>
</div>
$gallery
$jobsBlock
</div></section>
"@
  $pg += Footer
  W "home-$($h.id).html" $pg
}

# ------------------------------------------------------------------ CAREERS
$perks = @(
  @{t='Funded qualifications'; d='We fund the Care Certificate and recognised Health & Social Care Diplomas, plus NMC revalidation for our nurses.'}
  @{t='Room to grow'; d='Clear routes into senior and leadership roles for people who want them — and the support to get there.'}
  @{t='Supported from day one'; d='A proper induction, paid breaks, and a team that has your back on every shift.'}
)
$perkCards = ($perks | ForEach-Object {
"<div class=`"care-card`"><div class=`"care-card__icon`"><svg width=`"24`" height=`"24`" viewBox=`"0 0 24 24`" fill=`"none`" stroke=`"currentColor`" stroke-width=`"1.8`"><path d=`"M20 6 9 17l-5-5`"/></svg></div><h3 style=`"font-size:1.15rem;`">$(E $_.t)</h3><p style=`"margin:0;`">$(E $_.d)</p></div>"
}) -join "`n"
$serviceOpts = (($jobs.service | Select-Object -Unique | Sort-Object) | ForEach-Object { "<option value=`"$_`">$_</option>" }) -join ''
$locationOpts = (($jobs.location | Select-Object -Unique | Sort-Object) | ForEach-Object { "<option value=`"$_`">$_</option>" }) -join ''
$allJobCards = ($jobs | ForEach-Object { JobCard $_ }) -join "`n"
$crLocCount = (($jobs.location | Select-Object -Unique).Count)
$cr = CareersHeader 'careers' 'Careers'
$cr += @"
<section class="careers-hero"><div class="container"><span class="eyebrow hero__eyebrow">Venza Care UK Careers</span><h1>Caring careers, close to home</h1><p>We're hiring carers, nurses, chefs and managers across our care homes. Funded qualifications, real progression, and a team that has your back. Find a role and apply in minutes.</p><div class="careers-hero__stats"><span><strong>$($jobs.Count)</strong> open roles</span><span><strong>$crLocCount</strong> locations</span><span><strong>100%</strong> funded training</span></div></div></section>
<section class="section" style="padding-top:2.5rem;"><div class="container">
  <form class="careers-toolbar" action="careers.html" method="get">
    <div class="field"><label for="q">Search</label><input type="text" id="q" name="q" placeholder="Job title or keyword" /></div>
    <div class="field"><label for="service">Service</label><select id="service" name="service"><option value="">All services</option>$serviceOpts</select></div>
    <div class="field"><label for="location">Location</label><select id="location" name="location"><option value="">All locations</option>$locationOpts</select></div>
    <div class="careers-toolbar__actions"><button type="submit" class="btn btn--primary">Search</button></div>
  </form>
  <p class="muted" style="margin:1.5rem 0;"><strong style="color:var(--green-800)">$($jobs.Count)</strong> open roles</p>
  <div class="job-list">$allJobCards</div>
</div></section>
<section id="why" class="section section--alt"><div class="container"><div class="section-head center" style="margin-inline:auto;"><span class="eyebrow">Why join Venza Care</span><h2 class="h2">More than a job</h2></div><div class="care-grid">$perkCards</div></div></section>
"@
$cr += CareersFooter
W 'careers.html' $cr

# ------------------------------------------------------------------ JOB DETAIL PAGES
foreach($j in $jobs){
  $resp = ''
  if($j.responsibilities.Count){ $resp = "<h2>What you'll be doing</h2><ul>" + (($j.responsibilities | ForEach-Object { "<li>$(E $_)</li>" }) -join '') + "</ul>" }
  $reqs = ''
  if($j.requirements.Count){ $reqs = "<h2>What we're looking for</h2><ul>" + (($j.requirements | ForEach-Object { "<li>$(E $_)</li>" }) -join '') + "</ul>" }
  $salFact = if($j.salary){"<li><span>Salary</span><span>$(E $j.salary)</span></li>"}else{''}
  $hrsFact = if($j.hours){"<li><span>Hours</span><span>$(E $j.hours)</span></li>"}else{''}
  $pg = CareersHeader 'careers' $j.title
  $pg += @"
<section class="page-hero"><div class="container"><div class="crumbs"><a href="careers.html">All jobs</a> › $(E $j.title)</div><span class="badge badge--service" style="background:rgba(255,255,255,0.9);">$(E $j.service)</span><h1 style="margin-top:0.8rem;">$(E $j.title)</h1><p>$(E $j.summary)</p></div></section>
<section class="section"><div class="container"><div class="job-detail">
  <div class="prose">
    <h2 style="margin-top:0;">About the role</h2><p>$(E $j.description)</p>
    $resp
    $reqs
    <h2>What we offer</h2><ul><li>Paid breaks and holiday entitlement</li><li>A funded Care Certificate and recognised Health &amp; Social Care Diploma</li><li>NMC revalidation funded for our nurses</li><li>A proper induction and the chance to grow as we do</li></ul>
  </div>
  <aside class="apply-card" id="apply"><h3>Apply for this job</h3><p class="muted" style="margin-top:-0.3rem;font-size:0.92rem;">Job application — takes about 2 minutes.</p>
    <ul class="job-facts"><li><span>Location</span><span>$(E $j.location)</span></li><li><span>Contract</span><span>$(E $j.employmentType)</span></li>$salFact$hrsFact</ul>
    <form action="#" method="post" onsubmit="alert('This is a static preview — the live site saves applications to the admin backoffice.'); return false;">
      <div class="field"><label for="name">Full name *</label><input type="text" id="name" name="name" required /></div>
      <div class="field"><label for="email">Email *</label><input type="email" id="email" name="email" required /></div>
      <div class="field"><label for="phone">Phone</label><input type="tel" id="phone" name="phone" /></div>
      <div class="field"><label for="cv">Upload your CV</label><input type="file" id="cv" name="cv" /><span class="hint">PDF or Word, up to 8&nbsp;MB (optional).</span></div>
      <button type="submit" class="btn btn--primary btn--block">Submit application</button>
    </form></aside>
</div></div></section>
"@
  $pg += CareersFooter
  W "job-$($j.id).html" $pg
}

# ------------------------------------------------------------------ CONTACT
$ct = Header 'contact' 'Contact us'
$ct += @"
<section class="page-hero"><div class="container"><div class="crumbs"><a href="index.html">Home</a> › Contact</div><span class="eyebrow hero__eyebrow">Contact us</span><h1>Speak to a real person about care</h1><p>Ask about availability at any of our four homes, book a visit, or get help working out the right kind of care. Call us, or send a message and we'll reply within one working day.</p></div></section>
<section class="section"><div class="container"><div class="job-detail">
  <div><h2 style="margin-top:0;">Send us a message</h2><p class="muted">Fill in the form and we'll get back to you, usually within one working day.</p>
  <form action="#" method="post" style="max-width:560px;" onsubmit="alert('This is a static preview — the live site delivers enquiries to the admin backoffice.'); return false;"><div class="admin-form">
    <div class="grid-2"><div class="field"><label for="name">Your name *</label><input type="text" id="name" name="name" required /></div><div class="field"><label for="email">Email *</label><input type="email" id="email" name="email" required /></div></div>
    <div class="grid-2"><div class="field"><label for="phone">Phone</label><input type="tel" id="phone" name="phone" /></div><div class="field"><label for="subject">Subject</label><select id="subject" name="subject"><option>General enquiry</option><option>Arranging care</option><option>Book a visit</option><option>Fees &amp; funding</option><option>Careers</option></select></div></div>
    <div class="field"><label for="message">Message *</label><textarea id="message" name="message" required></textarea></div>
    <button type="submit" class="btn btn--primary">Send message</button>
  </div></form></div>
  <aside class="apply-card"><h3>Get in touch</h3><ul class="job-facts"><li><span>Call us</span><span><a href="tel:$phoneTel">$(E $SITE.phone)</a></span></li><li><span>Email</span><span><a href="mailto:$($SITE.email)">$(E $SITE.email)</a></span></li><li><span>Lines open</span><span>Mon–Sun, 8am–8pm</span></li></ul><p class="muted" style="font-size:0.92rem;"><strong style="color:var(--green-800)">Head office</strong><br />$(E $SITE.address)</p><a href="care-homes.html" class="btn btn--ghost btn--block">Find your nearest home</a></aside>
</div></div></section>
<section class="section section--alt" id="callback"><div class="container"><div style="max-width:640px;margin-inline:auto;text-align:center;">
  <span class="eyebrow">Prefer us to call you?</span><h2 class="h2">Request a callback</h2>
  <p class="lead" style="margin-inline:auto;">Leave your number and a good time, and a friendly member of our team will call you back — no obligation.</p>
  <form action="#" method="post" class="admin-form" style="text-align:left;margin-top:1.5rem;" onsubmit="alert('This is a static preview — on the live site this sends a callback request to the admin backoffice.'); return false;">
    <div class="grid-2"><div class="field"><label for="cb-name">Your name *</label><input type="text" id="cb-name" name="name" required /></div><div class="field"><label for="cb-phone">Phone number *</label><input type="tel" id="cb-phone" name="phone" required /></div></div>
    <div class="grid-2"><div class="field"><label for="cb-time">Best time to call</label><select id="cb-time" name="time"><option>Anytime</option><option>Morning (8am–12pm)</option><option>Afternoon (12–5pm)</option><option>Evening (5–8pm)</option></select></div><div class="field"><label for="cb-home">Home of interest (optional)</label><select id="cb-home" name="home"><option value="">Any / not sure</option>$(($homes | ForEach-Object { "<option>$(E $_.name)</option>" }) -join '')</select></div></div>
    <button type="submit" class="btn btn--primary">Request my callback</button>
  </form>
</div></div></section>
"@
$ct += Footer
W 'contact.html' $ct

# ------------------------------------------------------------------ LEGAL PAGES
$pv = Header '' 'Privacy policy'
$pv += @"
<section class="page-hero"><div class="container"><div class="crumbs"><a href="index.html">Home</a> › Privacy policy</div><span class="eyebrow hero__eyebrow">Your privacy</span><h1>Privacy policy</h1><p>How $(E $SITE.name) collects, uses and protects your personal information.</p></div></section>
<section class="section"><div class="container"><div class="prose" style="max-width:800px;">
  <p class="muted"><em>Template wording — please have it reviewed by your data-protection adviser before going live. Last updated: 2026.</em></p>
  <h2>1. Who we are</h2><p>$(E $SITE.name) ("we", "us", "our") is the data controller responsible for your personal data. You can contact us at <a href="mailto:$($SITE.email)">$(E $SITE.email)</a>, by phone on $(E $SITE.phone), or by post at $(E $SITE.address).</p>
  <h2>2. The information we collect</h2><ul><li><strong>Enquiries:</strong> your name, contact details and the details of your enquiry.</li><li><strong>Job applications:</strong> your name, contact details, right-to-work information, cover message and any CV you upload.</li><li><strong>Prospective &amp; current residents:</strong> health, care-needs and next-of-kin information needed to assess and provide care.</li><li><strong>Website usage:</strong> basic technical information needed to operate the site securely.</li></ul>
  <h2>3. How we use your information &amp; our lawful basis</h2><p>We process your data to respond to enquiries, arrange visits, assess and deliver care, manage recruitment, and meet our legal and regulatory duties. Depending on the activity, our lawful basis is consent, legitimate interests, performance of a contract, legal obligation, or — for health information — the provision of health and social care.</p>
  <h2>4. Sharing your information</h2><p>We may share information with healthcare professionals involved in your care, local authorities and the NHS, our regulators (such as the Care Quality Commission), and trusted service providers who help us run our homes and website. We never sell your data.</p>
  <h2>5. How long we keep it</h2><p>We keep personal data only as long as necessary for the purpose it was collected and to meet legal and regulatory requirements, after which it is securely deleted or anonymised.</p>
  <h2>6. Your rights</h2><p>Under UK data protection law you have the right to access, correct, erase, restrict or object to our use of your data, and to data portability. To exercise any of these rights, contact us using the details above.</p>
  <h2>7. Complaints</h2><p>If you have a concern we can't resolve, you can complain to the Information Commissioner's Office (ICO) at <a href="https://ico.org.uk" target="_blank" rel="noopener">ico.org.uk</a>.</p>
  <p style="margin-top:2rem;"><a href="cookies.html" class="care-card__link">See our cookie policy &rarr;</a></p>
</div></div></section>
"@
$pv += Footer
W 'privacy.html' $pv

$ck = Header '' 'Cookie policy'
$ck += @"
<section class="page-hero"><div class="container"><div class="crumbs"><a href="index.html">Home</a> › Cookie policy</div><span class="eyebrow hero__eyebrow">Cookies</span><h1>Cookie policy</h1><p>How and why $(E $SITE.name) uses cookies and similar technologies on this website.</p></div></section>
<section class="section"><div class="container"><div class="prose" style="max-width:800px;">
  <p class="muted"><em>Template wording — review against the cookies your live site actually sets before publishing. Last updated: 2026.</em></p>
  <h2>What are cookies?</h2><p>Cookies are small text files stored on your device when you visit a website. They help the site work properly and remember things between pages.</p>
  <h2>Cookies we use</h2>
  <table class="table" style="margin-top:1rem;"><thead><tr><th>Cookie</th><th>Type</th><th>Purpose</th></tr></thead><tbody>
    <tr><td>Session cookie</td><td>Strictly necessary</td><td>Keeps staff securely signed in to the admin area. Set only when an administrator logs in.</td></tr>
    <tr><td>Map &amp; fonts</td><td>Third-party</td><td>Our "find a home" map (OpenStreetMap) and web fonts (Google Fonts) are loaded from third parties, which may set their own cookies.</td></tr>
  </tbody></table>
  <h2>What we don't use</h2><p>This site does not currently use advertising or analytics/tracking cookies. If that changes, we will update this policy and ask for your consent where required.</p>
  <h2>Managing cookies</h2><p>You can control or delete cookies through your browser settings at any time. Blocking strictly necessary cookies may stop parts of the site (such as the admin area) from working.</p>
  <p style="margin-top:2rem;"><a href="privacy.html" class="care-card__link">See our privacy policy &rarr;</a></p>
</div></div></section>
"@
$ck += Footer
W 'cookies.html' $ck

$ac = Header '' 'Accessibility statement'
$ac += @"
<section class="page-hero"><div class="container"><div class="crumbs"><a href="index.html">Home</a> › Accessibility</div><span class="eyebrow hero__eyebrow">Accessibility</span><h1>Accessibility statement</h1><p>We want everyone to be able to use the $(E $SITE.name) website, whatever their needs.</p></div></section>
<section class="section"><div class="container"><div class="prose" style="max-width:800px;">
  <p class="muted"><em>Template wording — review and confirm with an accessibility audit before publishing. Last updated: 2026.</em></p>
  <h2>Our commitment</h2><p>We are committed to making this website accessible, in line with the Web Content Accessibility Guidelines (WCAG) 2.1 Level AA, and to making care information available to everyone.</p>
  <h2>What we do to help</h2><ul><li>Clear, readable text with strong colour contrast</li><li>Pages that work with a keyboard alone, and with screen readers</li><li>Descriptive text alternatives for meaningful images</li><li>A layout that adapts to phones, tablets and desktops, and supports text resizing</li></ul>
  <h2>Known limitations</h2><p>Our interactive "find a home" map may be difficult to use with some assistive technologies. The same information — every home's name, location and care types — is always available as a text list on the <a href="care-homes.html">Find a home</a> page, and our team is happy to help by phone.</p>
  <h2>Information in other formats</h2><p>If you need anything from this site in a different format — such as large print, easy-read, or read aloud over the phone — please contact us at <a href="mailto:$($SITE.email)">$(E $SITE.email)</a> or $(E $SITE.phone) and we'll do our best to help.</p>
  <h2>Feedback &amp; enforcement</h2><p>If you find a part of this site you can't use, please tell us using the details above so we can put it right. If you're not happy with our response, you can contact the Equality Advisory and Support Service (EASS) at <a href="https://www.equalityadvisoryservice.com" target="_blank" rel="noopener">equalityadvisoryservice.com</a>.</p>
  <p style="margin-top:2rem;"><a href="contact.html" class="btn btn--primary">Contact our team</a></p>
</div></div></section>
"@
$ac += Footer
W 'accessibility.html' $ac

"Pages written:"
Get-ChildItem $out -Filter *.html | Select-Object -ExpandProperty Name