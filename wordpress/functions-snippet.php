<?php
/**
 * Smart Ergonomic Budget Calculator — WordPress enqueue snippet
 * ---------------------------------------------------------------------------
 * RECOMMENDED METHOD. Loads the CSS/JS as separate, cacheable files instead of
 * inlining them into a Custom HTML block.
 *
 * The script is safe to load on every page even when the calculator is absent:
 * RT_Calculator.init() exits early if no .rt-calc element exists. If you would
 * rather load it only where needed, gate it on has_shortcode() (see the bottom
 * of this file).
 *
 * --- INSTALL -------------------------------------------------------------
 * 1. Copy these three files into your (child) theme, keeping the structure:
 *
 *      your-theme/assets/rt-calculator/rt-tokens.css
 *      your-theme/assets/rt-calculator/rt-calc.css
 *      your-theme/assets/rt-calculator/rt-calc.js
 *
 * 2. Paste the code below into your child theme's functions.php
 *    (or into a small mu-plugin; either is fine).
 *
 * 3. Paste the calculator markup into a Custom HTML block, or register the
 *    shortcode at the bottom and use [ergonomic_calculator].
 *
 * --- NOTES ---------------------------------------------------------------
 * • rt-tokens.css MUST load before rt-calc.css — the component layer consumes
 *   those custom properties. The dependency array below enforces the order.
 * • Bump $ver whenever you edit the files, otherwise browsers and page caches
 *   will keep serving the old copy.
 * • Do NOT enqueue demo-page.css: it is the local preview harness only.
 * • If your SEO plugin already outputs a SoftwareApplication schema node,
 *   do not add ours as well — duplicate nodes on one URL can invalidate the
 *   rich result.
 */

// ---------------------------------------------------------------------------
// 1. Enqueue the assets
// ---------------------------------------------------------------------------
add_action( 'wp_enqueue_scripts', 'rt_calculator_assets' );

function rt_calculator_assets() {
	$base = get_stylesheet_directory_uri() . '/assets/rt-calculator';
	$ver  = '0.7.0'; // bump on every change

	wp_enqueue_style(
		'rt-tokens',
		$base . '/rt-tokens.css',
		array(),
		$ver
	);

	wp_enqueue_style(
		'rt-calc',
		$base . '/rt-calc.css',
		array( 'rt-tokens' ), // dependency: guarantees correct load order
		$ver
	);

	// `true` puts the script in the footer. The file self-initialises on
	// DOMContentLoaded, so footer placement is safe.
	wp_enqueue_script(
		'rt-calc',
		$base . '/rt-calc.js',
		array(),
		$ver,
		true
	);
}

// ---------------------------------------------------------------------------
// 2. Optional: shortcode so the markup can be dropped into any page
// ---------------------------------------------------------------------------
// Put the markup (the .rt-calc block plus the .rt-methodology section) in:
//   your-theme/partials/calculator.php
//
// Then use [ergonomic_calculator] in any post or page.

add_action( 'init', 'rt_calculator_shortcode' );

function rt_calculator_shortcode() {
	add_shortcode( 'ergonomic_calculator', 'rt_calculator_render' );
}

function rt_calculator_render() {
	$partial = get_stylesheet_directory() . '/partials/calculator.php';

	if ( ! file_exists( $partial ) ) {
		return '<!-- rt-calculator: partials/calculator.php not found -->';
	}

	ob_start();
	include $partial;
	return ob_get_clean();
}

/**
 * ---------------------------------------------------------------------------
 * 3. Optional: load the assets only on pages that use the calculator
 * ---------------------------------------------------------------------------
 * Uncomment the guard at the top of rt_calculator_assets() below if you would
 * rather avoid a ~60 KB JS request on unrelated pages. (The script is harmless
 * everywhere; this is purely a performance choice.)
 *
 * 	if ( ! is_singular() || ! has_shortcode( get_post()->post_content ?? '', 'ergonomic_calculator' ) ) {
 * 		return;
 * 	}
 */

/**
 * ---------------------------------------------------------------------------
 * 4. Optional: allow the <style>/<script> tags of the single-file build
 * ---------------------------------------------------------------------------
 * Only relevant if you chose the Custom HTML block method AND your site strips
 * inline scripts. WordPress allows these tags for users with
 * `unfiltered_html`, which administrators have by default on single sites.
 * On multisite, or when a security plugin filters post content, a
 * shortcode/enqueue approach is more reliable than pasting raw <script>.
 */
