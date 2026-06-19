export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const targetUrl = url.searchParams.get("url");

  if (!targetUrl) {
    return new Response("Thiếu URL đích", { status: 400 });
  }

  // Chuyển tiếp yêu cầu (GET/POST) đến Google Apps Script
  const proxyRequest = new Request(targetUrl, request);
  
  // Xóa các header có thể gây lỗi CORS khi gọi chéo
  proxyRequest.headers.delete("Origin");
  proxyRequest.headers.delete("Referer");

  try {
    const response = await fetch(proxyRequest);
    
    // Gắn thêm header cho phép Miniapp đọc được dữ liệu trả về
    const newResponse = new Response(response.body, response);
    newResponse.headers.set("Access-Control-Allow-Origin", "*");
    
    return newResponse;
  } catch (error) {
    return new Response(error.message, { status: 500 });
  }
}