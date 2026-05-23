import { NextResponse } from 'next/server';
import { sendContactNotification } from '@9trip/shared/email/service';

function isValidEmail(email) {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request) {
	try {
		const { name, email, phone, message, subject } = await request.json();

		if (!name || !email || !message) {
			return NextResponse.json(
				{ error: 'Vui lòng điền đầy đủ họ tên, email và nội dung.' },
				{ status: 400 }
			);
		}

		if (!isValidEmail(email)) {
			return NextResponse.json({ error: 'Email không hợp lệ.' }, { status: 400 });
		}

		if (message.length < 10) {
			return NextResponse.json(
				{ error: 'Nội dung tin nhắn quá ngắn (tối thiểu 10 ký tự).' },
				{ status: 400 }
			);
		}

		const result = await sendContactNotification({ name, email, phone, message, subject });

		if (result.success) {
			return NextResponse.json({
				success: true,
				message: 'Cảm ơn bạn đã liên hệ! Chúng tôi sẽ phản hồi trong thời gian sớm nhất.',
			});
		} else {
			return NextResponse.json(
				{ error: 'Không thể gửi tin nhắn. Vui lòng thử lại sau.' },
				{ status: 500 }
			);
		}
	} catch (err) {
		console.error('[Contact] Error:', err.message);
		return NextResponse.json({ error: 'Có lỗi xảy ra. Vui lòng thử lại sau.' }, { status: 500 });
	}
}