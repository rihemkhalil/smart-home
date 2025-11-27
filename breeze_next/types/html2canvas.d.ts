declare module 'html2canvas' {
  interface Html2CanvasOptions {
    /** X position to crop capture */
    x?: number;
    /** Y position to crop capture */
    y?: number;
    /** Width of capture */
    width?: number;
    /** Height of capture */
    height?: number;
    /** Element to scroll if not the current window */
    scrollX?: number;
    /** Element to scroll if not the current window */
    scrollY?: number;
    /** Window to capture in, defaults to current window */
    windowWidth?: number;
    /** Window to capture in, defaults to current window */
    windowHeight?: number;
    /** Callback to check whether to ignore capturing an element */
    ignoreElements?: (element: Element) => boolean;
    /** Bitmap scale ratio, defaults to 1 */
    scale?: number;
    /** Whether to use CSS transforms, defaults to false */
    useCORS?: boolean;
    /** Whether to include foreign objects, defaults to false */
    foreignObjectRendering?: boolean;
    /** Whether to render background color, defaults to true */
    backgroundColor?: string | null;
    /** Whether to log errors, defaults to false */
    logging?: boolean;
    /** Proxy URL for cross-origin requests */
    proxy?: string;
    /** Whether to allow tainting canvas, defaults to false */
    allowTaint?: boolean;
    /** Whether to remove script and style tags from the cloned document, defaults to true */
    removeContainer?: boolean;
  }

  // Main function type
  function html2canvas(element: HTMLElement, options?: Html2CanvasOptions): Promise<HTMLCanvasElement>;
  
  export default html2canvas;
}
